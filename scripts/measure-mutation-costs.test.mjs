import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { controlGroupKey } from "./lib/mutation-partition.mjs";
import {
  parseMutationLog,
  summarizeGroups,
  median,
  proposeRunnerDefaults,
  proposeTableRows,
  simulateShards,
  proposeWeights,
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

  test("表に載る組（表の行）を除いた組の、ランナーごとの対照・検出の中央値を、0.1 秒単位に丸めて出す", () => {
    const groups = [
      group("node", 1, 0.3, 0.2, ["a"]),
      group("node", 1, 0.5, 0.4, ["b"]),
      group("node", 1, 0.4, 0.6, ["c"]),
      group("node", 1, 40, 40, ["heavy"]), // 外れ値。表の行なので中央値に混ぜない
    ];
    const d = proposeRunnerDefaults(groups, new Set([`p-node\n${JSON.stringify(["heavy"])}`]));
    assert.deepEqual(d.node, { control: 0.4, mutation: 0.4 });
  });

  test("載せる目安: 合計が 30 秒以上で、見積もりの半分以下。変異の無い組は元から入力に来ない", () => {
    const est = () => 1;
    const heavy = group("node", 2, 5, 14.5); // 34 秒・見積もり 1
    const light = group("node", 2, 0.4, 0.3);
    const justLow = group("node", 2, 5, 10); // 25 秒 < 30
    const estBig = group("node", 2, 5, 14.5); // 合計 34・見積もり 20 > 17
    const rows = proposeTableRows([heavy, light, justLow], (g) => (g === estBig ? 20 : est(g)));
    assert.deepEqual(rows.map((g) => g), [heavy]);
    assert.deepEqual(proposeTableRows([estBig], () => 20), []);
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
