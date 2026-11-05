import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MUTATIONS } from "./lib/mutation-declarations.mjs";
import { controlGroupKey } from "./lib/mutation-partition.mjs";
import { HEAVY_RUN_SECONDS } from "./lib/mutation-weights.mjs";
import {
  parseMutationLog,
  summarizeGroups,
  median,
  proposeRunnerDefaults,
  proposeTableRows,
  simulateShards,
  proposeWeights,
  holdOut,
  parseBaseline,
  onlyDeclared,
  totalSeconds,
  HEAVY_TOTAL_SECONDS,
  weightsFrom,
  commandToTests,
} from "./measure-mutation-costs.mjs";

/**
 * CI のログから組ごとの秒数を数える道具の自己テスト（#550）。
 * 入力はログのテキスト。fixture は CI のログの形（行頭の時刻・`[w番号]`・`--- 変異`→`対照:`→`検出:`）を小さく写したもの。
 */

const T = (sec) => `2026-11-05T13:59:${String(Math.floor(sec)).padStart(2, "0")}.${String(Math.round((sec % 1) * 1000)).padStart(3, "0")}0000Z`;
const line = (sec, w, text) => `${T(sec)} ${w ? `[${w}] ` : ""}${text}`;
const vitest = (tests, pkg) => `npx vitest run --maxWorkers=1 ${tests}（cwd: ${pkg}, runner: vitest）`;
const nodeCmd = (tests, pkg) => `node --test --test-concurrency=1 ${tests}（cwd: ${pkg}, runner: node）`;
const bunCmd = (tests, pkg) => `bun test ${tests}（cwd: ${pkg}, runner: bun）`;

// w1 と w2 の出力が交互に混ざる。#1 は対照 2 秒・検出 1 秒、#2 は同じ組の使い回し（検出 1.5 秒）。
const FIXTURE = [
  line(0, "w1", "--- 変異 #1: a ---"),
  line(0.1, "w2", "--- 変異 #7: b ---"),
  line(2, "w1", `  対照: ○ 通過（${vitest("test/a.test.ts", "packages/x")}）`),
  line(2.4, "w2", `  対照: ○ 通過（${nodeCmd("lib/x.test.mjs b.test.mjs", "scripts")}）`),
  line(2.5, "w1", "     Tests 3 passed"),
  line(3, "w1", "  検出: ○ 検出された（exit code 1）"),
  line(3, "w1", "--- 変異 #2: a2 ---"),
  line(3, "w1", `  対照: ○ 通過（使い回し）（${vitest("test/a.test.ts", "packages/x")}）`),
  line(4.5, "w1", "  検出: ○ 検出された（exit code 1）"),
  line(7.4, "w2", "  検出: ○ 検出された（exit code 1）"),
  line(8, "w2", "--- 変異 #8: c ---"),
  line(8.2, "w2", `  対照: ○ 通過（${bunCmd("test/live.test.ts", "apps/s")}）`),
  line(9.2, "w2", "  検出: ○ 検出された（exit code 1）"),
].join("\n");

describe("commandToTests: 対照のコマンドからテストの並びを戻す", () => {
  test("vitest・bun・node のそれぞれで、前置きとフラグを除いたテストの並びになる", () => {
    assert.deepEqual(commandToTests("npx vitest run --maxWorkers=1 test/a.test.ts test/b.test.ts", "vitest"), ["test/a.test.ts", "test/b.test.ts"]);
    assert.deepEqual(commandToTests("bun test test/live.test.ts", "bun"), ["test/live.test.ts"]);
    assert.deepEqual(commandToTests("node --test --test-concurrency=1 lib/x.test.mjs b.test.mjs", "node"), ["lib/x.test.mjs", "b.test.mjs"]);
  });
  test("テストを指定しないコマンド（scripts 全体）は空の並び", () => {
    assert.deepEqual(commandToTests("node --test --test-concurrency=1", "node"), []);
  });
});

describe("parseMutationLog", () => {
  const records = parseMutationLog(FIXTURE);
  const byId = (id) => records.find((r) => r.id === id);

  test("変異ごとに 1 件、組の置き場・テストの並び・ランナーを読む", () => {
    assert.deepEqual(records.map((r) => r.id).sort((a, b) => a - b), [1, 2, 7, 8]);
    assert.equal(byId(1).pkg, "packages/x");
    assert.deepEqual(byId(1).tests, ["test/a.test.ts"]);
    assert.equal(byId(1).runner, "vitest");
    assert.deepEqual(byId(7).tests, ["lib/x.test.mjs", "b.test.mjs"]);
  });

  test("対照は「変異」の行から「対照:」の行まで、検出は「対照:」の行から「検出:」の行まで（別のワーカーの行が混ざっても数える）", () => {
    assert.ok(Math.abs(byId(1).controlSec - 2) < 1e-6);
    assert.ok(Math.abs(byId(1).detectSec - 1) < 1e-6);
    assert.ok(Math.abs(byId(7).controlSec - 2.3) < 1e-6);
    assert.ok(Math.abs(byId(7).detectSec - 5) < 1e-6);
  });

  test("対照の使い回しは対照の秒数に数えない（null）。検出は数える", () => {
    assert.equal(byId(2).controlSec, null);
    assert.ok(Math.abs(byId(2).detectSec - 1.5) < 1e-6);
  });

  test("ワーカーの印の無いログ（--jobs なし）も読める", () => {
    const plain = [
      line(0, "", "--- 変異 #5: z ---"),
      line(1, "", `  対照: ○ 通過（${bunCmd("t.test.ts", "apps/s")}）`),
      line(3, "", "  検出: ○ 検出された（exit code 1）"),
    ].join("\n");
    const [r] = parseMutationLog(plain);
    assert.equal(r.id, 5);
    assert.equal(r.controlSec, 1);
    assert.equal(r.detectSec, 2);
  });

  test("先頭の BOM があっても読める。検出まで届かなかった変異（途中で切れたログ）は数えない", () => {
    const cut = `﻿${line(0, "w1", "--- 変異 #9: q ---")}\n${line(1, "w1", `  対照: ○ 通過（${bunCmd("t.test.ts", "apps/s")}）`)}`;
    assert.deepEqual(parseMutationLog(cut), []);
    assert.equal(parseMutationLog(`﻿${FIXTURE}`).length, 4);
  });
});

describe("summarizeGroups: 組ごとに、run をまたいだ代表値", () => {
  const rec = (id, control, detect, over = {}) => ({ id, pkg: "scripts", tests: ["a.test.mjs"], runner: "node", controlSec: control, detectSec: detect, ...over });

  test("組ごとに件数・対照（使い回しを除く平均）・検出（平均）を、run ごとに出し、run の平均を代表値にする", () => {
    const runs = [
      { name: "r1", records: [rec(1, 4, 2), rec(2, null, 4)] },
      { name: "r2", records: [rec(1, 6, 3), rec(2, null, 5)] },
    ];
    const [g] = summarizeGroups(runs);
    assert.equal(g.pkg, "scripts");
    assert.equal(g.runner, "node");
    assert.equal(g.count, 2);
    assert.deepEqual(g.perRun.map((p) => [p.control, p.mutation]), [[4, 3], [6, 4]]);
    assert.equal(g.control, 5);
    assert.equal(g.mutation, 3.5);
  });

  test("置き場かテストの並びが違えば別の組", () => {
    const runs = [{ name: "r1", records: [rec(1, 1, 1), rec(2, 1, 1, { tests: ["b.test.mjs"] }), rec(3, 1, 1, { pkg: "packages/y" })] }];
    assert.equal(summarizeGroups(runs).length, 3);
  });

  test("ある run にしか無い組は、その run だけの値を代表値にする", () => {
    const runs = [{ name: "r1", records: [rec(1, 4, 2)] }, { name: "r2", records: [] }];
    const [g] = summarizeGroups(runs);
    assert.equal(g.control, 4);
    assert.equal(g.perRun.length, 1);
  });
});

describe("median", () => {
  test("奇数は真ん中・偶数は真ん中 2 つの平均・空は NaN", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.ok(Number.isNaN(median([])));
  });
});

describe("proposeRunnerDefaults / proposeTableRows", () => {
  const group = (runner, count, control, mutation, tests = ["x"]) => ({ pkg: `p-${runner}`, tests, runner, count, control, mutation });

  test("既定値は、表の行を除いた組の合計を合わせる平均（対照 = 組ごとの平均・検出 = 検出の合計 ÷ 件数）を 0.1 秒単位に丸めたもの（中央値ではない）", () => {
    const groups = [
      group("node", 1, 0.3, 0.2, ["a"]),
      group("node", 1, 0.5, 0.4, ["b"]),
      group("node", 2, 0.4, 3.1, ["c"]), // 検出の裾。中央値なら 0.4 になるが、合計を合わせる平均は引かれる
      group("node", 1, 40, 40, ["heavy"]), // 表の行なので混ぜない
    ];
    const d = proposeRunnerDefaults(groups, new Set([`p-node\n${JSON.stringify(["heavy"])}`]));
    // 対照: (0.3+0.5+0.4)/3 = 0.4、検出: (0.2+0.4+2*3.1)/4 = 1.7
    assert.deepEqual(d.node, { control: 0.4, mutation: 1.7 });
  });

  test("ランナーごとの合計: 既定値で見積もった合計は、丸めの範囲で実測の合計と合う", () => {
    const groups = [group("bun", 1, 0.1, 0.1, ["a"]), group("bun", 3, 0.2, 5, ["b"]), group("bun", 1, 0.1, 0.2, ["c"])];
    const d = proposeRunnerDefaults(groups, new Set()).bun;
    const actual = groups.reduce((s, g) => s + g.control + g.mutation * g.count, 0);
    const est = groups.reduce((s, g) => s + d.control + d.mutation * g.count, 0);
    assert.ok(Math.abs(est - actual) / actual < 0.05, `実測 ${actual} に対し見積もり ${est}`);
  });

  test("載せる目安: 合計が 30 秒以上で、実測が見積もりのちょうど 2 倍以上（境界を含む）。見積もりが 2 倍に届かない組は載せない", () => {
    const heavy = group("node", 2, 5, 14.5); // 34 秒
    assert.deepEqual(proposeTableRows([heavy], () => 17), [heavy]); // ちょうど 2 倍
    assert.deepEqual(proposeTableRows([heavy], () => 17.1), []); // 2 倍に届かない
    const light = group("node", 2, 0.4, 0.3);
    const justLow = group("node", 2, 5, 12); // 29 秒 < 30
    assert.deepEqual(proposeTableRows([heavy, light, justLow], () => 1), [heavy]);
  });

  test("自己テストの下限（HEAVY_RUN_SECONDS）に届かない行は案に出さない（そのまま写して赤にならない）", () => {
    const manyLight = group("node", 40, 1, HEAVY_RUN_SECONDS / 2 - 1.5 - 0.01); // 合計は大きいが 1 回 control+mutation < 下限
    assert.ok(manyLight.control + manyLight.mutation < HEAVY_RUN_SECONDS);
    assert.ok(totalSeconds(manyLight) >= HEAVY_TOTAL_SECONDS);
    assert.deepEqual(proposeTableRows([manyLight], () => 1), []);
    const atLimit = group("node", 40, 4, HEAVY_RUN_SECONDS - 4);
    assert.deepEqual(proposeTableRows([atLimit], () => 1), [atLimit]);
  });
});

describe("holdOut / onlyDeclared: CLI の取り置きと宣言の絞り込み", () => {
  test("holdOut: i 番目を除いた run の並び（順は保つ）", () => {
    const runs = ["a", "b", "c"].map((name) => ({ name, records: [] }));
    assert.deepEqual(holdOut(runs, 1).map((r) => r.name), ["a", "c"]);
    assert.deepEqual(holdOut(runs, 0).map((r) => r.name), ["b", "c"]);
    assert.equal(runs.length, 3);
  });

  test("onlyDeclared: 宣言の組の鍵に一致する変異だけを残す", () => {
    const rec = (tests) => ({ id: 1, pkg: "scripts", tests, runner: "node", controlSec: 1, detectSec: 1 });
    const keys = new Set([controlGroupKey({ pkg: "scripts", tests: ["a.test.mjs"] })]);
    const kept = onlyDeclared([rec(["a.test.mjs"]), rec(["b.test.mjs"]), rec(["a.test.mjs", "b.test.mjs"])], keys);
    assert.deepEqual(kept.map((r) => r.tests), [["a.test.mjs"]]);
  });
});

describe("simulateShards: 実測の秒数で、分け方（--shard k/n・--jobs m）の最長と最短のワーカーを出す", () => {
  // 組 A（重い 100 秒）・B,C,D,E（各 10 秒）。見積もりが全組同じなら、並びの順に配られて偏る。
  const mk = (id, name, sec) => ({ id, pkg: "scripts", tests: [name], runner: "node", controlSec: sec / 2, detectSec: sec / 2 });
  const records = [mk(1, "a.test.mjs", 100), mk(2, "b.test.mjs", 10), mk(3, "c.test.mjs", 10), mk(4, "d.test.mjs", 10), mk(5, "e.test.mjs", 10), mk(6, "f.test.mjs", 10)];

  test("見積もりが実測と合えば、最長のワーカーは重い組 1 つ分で、最短との差も小さい", () => {
    const cost = { "a.test.mjs": 100 };
    const truth = (g) => cost[g.tests[0]] ?? 10;
    const r = simulateShards(records, { shards: 2, jobs: 2, weightOf: truth, isHeavy: () => false });
    assert.equal(r.workers.length, 3); // 重い組 1 つのシャードは、組が 1 つなのでワーカーも 1 つ
    assert.equal(r.max, 100);
    assert.equal(r.workers.reduce((s, w) => s + w, 0), 150);
  });

  test("見積もりが全組同じ（実測を知らない）と、実測の差が開く。差（max − min）で比べられる", () => {
    const good = simulateShards(records, { shards: 2, jobs: 2, weightOf: (g) => (g.tests[0] === "a.test.mjs" ? 100 : 10), isHeavy: () => false });
    const flat = simulateShards(records, { shards: 2, jobs: 2, weightOf: () => 1, isHeavy: () => false });
    assert.ok(flat.max - flat.min >= good.max - good.min);
    assert.equal(good.spread, good.max - good.min);
  });

  test("各シャード・全ワーカーの最長が出る（シャードの所要時間は、そのワーカーの最長）", () => {
    const r = simulateShards(records, { shards: 2, jobs: 2, weightOf: (g) => (g.tests[0] === "a.test.mjs" ? 100 : 10), isHeavy: () => false });
    assert.equal(r.shards.length, 2);
    assert.equal(Math.max(...r.shards.map((s) => s.max)), r.max);
  });
});

describe("proposeWeights / weightsFrom: 既定値と表の行をまとめて案にする", () => {
  const g = (pkg, runner, count, control, mutation, tests = ["x.test"]) => ({ key: controlGroupKey({ pkg, tests }), pkg, tests, runner, count, control, mutation });
  const groups = [
    g("a", "node", 1, 0.2, 0.2, ["l1"]),
    g("a", "node", 2, 0.4, 0.3, ["l2"]),
    g("a", "node", 1, 0.3, 0.4, ["l3"]),
    g("a", "node", 3, 10.3, 9.8, ["heavy"]), // 合計 39.7 秒。見積もりの 2 倍以上
    g("b", "bun", 1, 0.1, 0.2, ["b1"]),
  ];

  test("表の行は半秒単位に丸め、既定値は表の行を除いた組から測る", () => {
    const { defaults, rows } = proposeWeights(groups);
    assert.deepEqual(rows.map((r) => [r.pkg, r.tests, r.control, r.mutation]), [["a", ["heavy"], 10.5, 10]]);
    assert.deepEqual(defaults.node, { control: 0.3, mutation: 0.3 });
    assert.deepEqual(defaults.bun, { control: 0.1, mutation: 0.2 });
  });

  test("weightsFrom: 表の行は実測の秒数・それ以外はランナーの既定値で数え、表の行だけが重い組", () => {
    const w = weightsFrom(proposeWeights(groups));
    const group = (key, runner, n) => ({ key, pkg: "a", tests: [], mutations: Array.from({ length: n }, () => ({ runner })) });
    const heavy = group(controlGroupKey({ pkg: "a", tests: ["heavy"] }), "node", 3);
    assert.equal(w.weightOf(heavy), 10.5 + 3 * 10);
    assert.equal(w.isHeavy(heavy), true);
    const light = group(controlGroupKey({ pkg: "a", tests: ["l1"] }), "node", 2);
    assert.ok(Math.abs(w.weightOf(light) - (0.3 + 2 * 0.3)) < 1e-9);
    assert.equal(w.isHeavy(light), false);
  });
});

describe("commandToTests: ランナーの語の位置から後ろを取る（#550 のレビュー）", () => {
  test("ランナーの前に空白を含むパスがあっても、テストの鍵がずれない", () => {
    assert.deepEqual(commandToTests("/opt/my tools/npx vitest run --maxWorkers=1 a.test.ts b.test.ts", "vitest"), ["a.test.ts", "b.test.ts"]);
    assert.deepEqual(commandToTests("/opt/my tools/node --test --test-concurrency=1 x.test.mjs", "node"), ["x.test.mjs"]);
    assert.deepEqual(commandToTests("/opt/my tools/bun test t.test.ts", "bun"), ["t.test.ts"]);
  });
});

describe("parseMutationLog: mutation-check 自身の状態行の形だけを数える（#550 のレビュー）", () => {
  test("字下げの違う行・検出されなかった変異の生の出力にある「対照:」「検出:」は数えない", () => {
    const log = [
      line(0, "w1", "--- 変異 #1: a ---"),
      line(1, "w1", `  対照: ○ 通過（${nodeCmd("a.test.mjs", "scripts")}）`),
      line(1.5, "w1", "    検出: ○ これはテストの出力の字下げ違い（数えない）"),
      line(1.6, "w1", "      対照: ○ 通過（node --test x.test.mjs（cwd: scripts, runner: node））"),
      line(2, "w1", "  検出: ○ 検出された（exit code 1）"),
      line(2.5, "w1", "  検出: ○ 検出された（開いた変異が無いので数えない）"),
    ].join("\n");
    const records = parseMutationLog(log);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].tests, ["a.test.mjs"]);
    assert.ok(Math.abs(records[0].detectSec - 1) < 1e-6);
  });

  test("検出されなかった（×）変異も、mutation-check の形なら数える", () => {
    const log = [line(0, "", "--- 変異 #1: a ---"), line(1, "", `  対照: ○ 通過（${bunCmd("t.test.ts", "apps/s")}）`), line(2, "", "  × 検出されなかった")].join("\n");
    assert.equal(parseMutationLog(log).length, 0);
    const ok = [line(0, "", "--- 変異 #1: a ---"), line(1, "", `  対照: ○ 通過（${bunCmd("t.test.ts", "apps/s")}）`), line(2, "", "  検出: × 検出されなかった")].join("\n");
    assert.equal(parseMutationLog(ok).length, 1);
  });
});

describe("ランナーの組が無い・全組が表の行のとき（#550 のレビュー）", () => {
  const g = (pkg, runner, count, control, mutation, tests = ["x"]) => ({ key: controlGroupKey({ pkg, tests }), pkg, tests, runner, count, control, mutation });

  test("表の行を除くと組が無いランナーは、既定値の案に出さない（NaN・undefined を出さない）", () => {
    const groups = [g("a", "node", 1, 0.2, 0.2), g("b", "bun", 3, 20, 20, ["heavy"])];
    const d = proposeRunnerDefaults(groups, new Set([controlGroupKey({ pkg: "b", tests: ["heavy"] })]));
    assert.deepEqual(Object.keys(d), ["node"]);
  });

  test("proposeWeights: 組が 1 つだけのランナー（その組が表の行になりうる）があっても、案は有限の値だけで、行の出入りを繰り返さない", () => {
    const groups = [g("a", "node", 1, 0.2, 0.2), g("a", "node", 1, 0.3, 0.3, ["y"]), g("b", "bun", 2, 20, 20, ["only"]), g("c", "vitest", 1, 3, 3, ["v"])];
    const first = proposeWeights(groups);
    for (const d of Object.values(first.defaults)) assert.ok(Number.isFinite(d.control) && Number.isFinite(d.mutation), JSON.stringify(first.defaults));
    assert.deepEqual(proposeWeights(groups), first);
  });

  test("weightsFrom: 案に無いランナーは、渡した前の値（既定は RUNNER_COST_SECONDS）で数える", () => {
    const w = weightsFrom({ defaults: {}, rows: [] }, { bun: { control: 1, mutation: 2 } });
    const group = { key: "k", pkg: "p", tests: [], mutations: [{ runner: "bun" }, { runner: "bun" }] };
    assert.equal(w.weightOf(group), 1 + 2 * 2);
  });

  test("取り置いた run にだけあるランナーがあっても、案を測る側に組が無いだけで落ちない", () => {
    const only = [{ name: "a", records: [{ id: 1, pkg: "scripts", tests: ["a.test.mjs"], runner: "node", controlSec: 1, detectSec: 1 }] }];
    const w = weightsFrom(proposeWeights(summarizeGroups(only)));
    const bunGroup = { key: "k", pkg: "p", tests: [], mutations: [{ runner: "bun" }] };
    assert.ok(Number.isFinite(w.weightOf(bunGroup)) && w.weightOf(bunGroup) > 0);
  });
});

describe("parseBaseline: 基準の重みを明示で渡す", () => {
  test("既定値と表の行から、重さと重い組の印を作る", () => {
    const w = parseBaseline(JSON.stringify({ defaults: { vitest: { control: 3, mutation: 3 }, bun: { control: 0.6, mutation: 2 }, node: { control: 0.4, mutation: 0.4 } }, rows: [{ pkg: "scripts", tests: ["h.test.mjs"], control: 31, mutation: 28 }] }));
    const heavy = { key: controlGroupKey({ pkg: "scripts", tests: ["h.test.mjs"] }), pkg: "scripts", tests: ["h.test.mjs"], mutations: [{ runner: "node" }, { runner: "node" }] };
    assert.equal(w.weightOf(heavy), 31 + 2 * 28);
    assert.equal(w.isHeavy(heavy), true);
    const light = { key: "x", pkg: "scripts", tests: [], mutations: [{ runner: "node" }] };
    assert.ok(Math.abs(w.weightOf(light) - 0.8) < 1e-9);
  });

  test("形が違えば、どこが違うかを言って落とす", () => {
    assert.throws(() => parseBaseline("{}"), /defaults/);
    const { bun, ...noBun } = JSON.parse(JSON.stringify({ vitest: { control: 3, mutation: 3 }, bun: { control: 1, mutation: 1 }, node: { control: 1, mutation: 1 } }));
    assert.throws(() => parseBaseline(JSON.stringify({ defaults: noBun, rows: [] })), /bun/); // ランナーが欠けたら名指しして落とす（後で TypeError にしない）
    assert.throws(() => parseBaseline(JSON.stringify({ defaults: { vitest: { control: 1, mutation: 1 }, bun: { control: 1, mutation: 1 }, node: { control: "x", mutation: 1 } }, rows: [] })), /node/);
    assert.throws(() => parseBaseline(JSON.stringify({ defaults: { vitest: { control: 1, mutation: 1 }, bun: { control: 1, mutation: 1 }, node: { control: 1, mutation: 1 } }, rows: [{ pkg: "a" }] })), /rows/);
  });
});

describe("CLI の配線: 小さなログを子プロセスで流す（#550 のレビュー）", () => {
  const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "measure-mutation-costs.mjs");
  const declared = MUTATIONS.find((m) => m.pkg === "scripts" && m.tests.length === 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "measure-cli-"));
  const logOf = (extraUndeclared) => {
    const rows = [line(0, "w1", "--- 変異 #1: a ---"), line(1, "w1", `  対照: ○ 通過（${nodeCmd(declared.tests[0], "scripts")}）`), line(3, "w1", "  検出: ○ 検出された（exit code 1）")];
    if (extraUndeclared) rows.push(line(4, "w1", "--- 変異 #2: b ---"), line(5, "w1", `  対照: ○ 通過（${nodeCmd("zz-undeclared.test.mjs", "scripts")}）`), line(6, "w1", "  検出: ○ 検出された（exit code 1）"));
    return rows.join("\n");
  };
  const files = ["a", "b", "c"].map((n, i) => {
    const f = path.join(dir, `${n}.log`);
    fs.writeFileSync(f, logOf(i === 0));
    return f;
  });
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("宣言に無い組の変異は数えず、その件数を知らせる", () => {
    const r = run(...files);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /いまの宣言に無い組の変異 1 件は数えない/);
    assert.doesNotMatch(r.stdout, /zz-undeclared/);
    assert.match(r.stdout, new RegExp(declared.tests[0].replace(/[.]/g, "\\.")));
  });

  test("--leave-one-out は、残した run 以外（run の数 − 1）から測った案で分ける", () => {
    const r = run("--leave-one-out", "--shards", "1", "--jobs", "1", ...files);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout.match(/他の 2 run から測った案で分ける/g) ?? []).length, 3);
    assert.doesNotMatch(r.stdout, /他の 3 run/);
  });

  test("--simulate は、基準の重みと測り直した案の重みを run ごとに並べる。--baseline の JSON を使う", () => {
    const base = path.join(dir, "baseline.json");
    fs.writeFileSync(base, JSON.stringify({ defaults: { vitest: { control: 1, mutation: 1 }, bun: { control: 1, mutation: 1 }, node: { control: 1, mutation: 1 } }, rows: [] }));
    const r = run("--simulate", "--shards", "1", "--jobs", "1", "--baseline", base, ...files);
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout.match(/基準の重み:/g) ?? []).length, 3);
    assert.equal((r.stdout.match(/測り直した案の重み:/g) ?? []).length, 3);
    const bad = run("--simulate", "--baseline", path.join(dir, "nope.json"), ...files);
    assert.notEqual(bad.status, 0);
  });
});
