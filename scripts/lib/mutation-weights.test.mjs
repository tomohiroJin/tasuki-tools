import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURED_GROUP_SECONDS, groupKeyOf, measuredCostOf, HEAVY_RUN_SECONDS } from "./mutation-weights.mjs";
import { weightOfGroup, RUNNER_COST_SECONDS } from "../mutation-check.mjs";
import { MUTATIONS } from "./mutation-declarations.mjs";
import { selectMutations } from "./mutation-select.mjs";
import { groupByControl } from "./mutation-partition.mjs";
import { planWorkers } from "./mutation-parallel.mjs";

/**
 * `scripts/lib/mutation-weights.mjs` の自己テスト（#546）。
 * 重い組の実測の秒数の表と、その引き方、見積もり（`weightOfGroup`）が表を使って分け方に効く配線を見る。
 * （`scripts/mutation-check.test.mjs` を変異の `tests` に置くと、変異検査の中で流した対照実行が落ちた（#546 で確認）。
 * 変異で守るために、この配線の検査はこのファイルへ置く）
 */

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("groupKeyOf / measuredCostOf: 表の引き方", () => {
  test("鍵は置き場とテストの並びで決まる（対照の組と同じ単位）", () => {
    assert.equal(groupKeyOf({ pkg: "scripts", tests: ["a.test.mjs", "b.test.mjs"] }), "scripts :: a.test.mjs b.test.mjs");
  });

  test("表にある組は実測の秒数を返し、無い組は null（呼び出し側が既定値へ倒す）", () => {
    const [key, cost] = Object.entries(MEASURED_GROUP_SECONDS)[0];
    const [pkg, rest] = key.split(" :: ");
    assert.deepEqual(measuredCostOf({ pkg, tests: rest.split(" ") }), cost);
    assert.equal(measuredCostOf({ pkg: "scripts", tests: ["no-such-heavy.test.mjs"] }), null);
  });

  test("テストの並びが違えば別の組（部分一致で拾わない）", () => {
    assert.equal(measuredCostOf({ pkg: "scripts", tests: ["test-shuffled.test.mjs", "x.test.mjs"] }), null);
  });
});

describe("MEASURED_GROUP_SECONDS: 表そのものの形", () => {
  const entries = Object.entries(MEASURED_GROUP_SECONDS);

  test("表は空でなく、凍結されている（実行中に書き換えられない）", () => {
    assert.ok(entries.length > 0);
    assert.ok(Object.isFrozen(MEASURED_GROUP_SECONDS));
  });

  test("どの値も正の有限の秒数で、対照と検出の両方を持つ", () => {
    for (const [key, cost] of entries) {
      for (const field of ["control", "mutation"]) {
        assert.ok(Number.isFinite(cost[field]) && cost[field] > 0, `${key}: ${field}=${cost[field]}`);
      }
    }
  });

  test("載せるのは重い組だけ（対照 1 回＋検出 1 回が、いちばん重い既定値（vitest）を超える。軽い組は既定値で足りる）", () => {
    for (const [key, cost] of entries) {
      assert.ok(cost.control + cost.mutation >= HEAVY_RUN_SECONDS, `${key}: ${cost.control + cost.mutation} 秒は軽すぎる`);
    }
  });

  test("鍵のテストファイルが実在する（消した・改名したファイルの行を残さない）", () => {
    for (const [key] of entries) {
      const [pkg, rest] = key.split(" :: ");
      for (const file of rest.split(" ")) {
        assert.ok(fs.existsSync(path.join(WORKSPACE_ROOT, pkg, file)), `${key}: ${file} が無い`);
      }
    }
  });

  test("表の行がすべて、宣言の組の鍵と一致する（tests の並びを変えて行が黙って効かなくならない。変異の無い組は載せない）", () => {
    const declared = new Set(groupByControl(MUTATIONS).map(groupKeyOf));
    for (const [key] of entries) assert.ok(declared.has(key), `${key} は宣言のどの組とも一致しない（表の鍵を直すか、行を消す）`);
  });
});

/**
 * 重い組が同じ分け前に寄らない（#546）。見積もりが組ごとの実測を使うことを、分け方の結果で見る。
 * 以前は node の組を一律 0.4 秒と数えたので、60 秒の組も 0.4 秒の組も同じ重さで、重い組が 1 つのワーカーに寄りえた
 * （#544 で 1 つのシャードが 18 分になった）。
 */
describe("重い組の見積もりと分け方（#546）", () => {
  // 重い組（表の行）。各 1 件の変異で、既定値の見積もりでは軽い組（0.8 秒）と同じ重さに数えられる。
  // 軽い組の名前は、鍵の辞書順で重い組の直前に並ぶように付ける（'-' は '.' より前）ので、
  // 重さを区別できないと、並びの順に配られて重い組が全部同じワーカー・シャードに寄る（変異 1010 で表を引かなくなると赤になる）
  const heavyTests = [
    ["audit-test-focus.test.mjs"],
    ["lib/toolchain.test.mjs", "check-toolchain.test.mjs"],
    ["local-check.test.mjs"],
    ["test-shuffled.test.mjs"],
  ];
  const keyOfTests = (tests) => tests.join(" ");
  const isHeavy = (m) => heavyTests.some((t) => keyOfTests(t) === keyOfTests(m.tests));
  const clustered = (heavies, lightsBefore) => {
    const list = [];
    let id = 1;
    for (const tests of heavies) {
      for (const x of ["a", "b", "c"].slice(0, lightsBefore)) {
        list.push({ id: id++, pkg: "scripts", tests: [`${tests[0].replace(".test.mjs", "")}-${x}.test.mjs`] });
      }
      list.push({ id: id++, pkg: "scripts", tests });
    }
    return list;
  };
  const heavyGroupsIn = (muts) => new Set(muts.filter(isHeavy).map((m) => keyOfTests(m.tests))).size;

  test("表にある組は実測の秒数で数え、表に無い組は今までのランナーごとの既定値", () => {
    const heavy = { pkg: "scripts", tests: ["test-shuffled.test.mjs"], mutations: [{}, {}] };
    assert.equal(weightOfGroup(heavy), 31 + 2 * 28); // 手で書いた期待値（表の行）
    const light = { pkg: "scripts", tests: ["no-such-heavy.test.mjs"], mutations: [{}, {}] };
    assert.equal(weightOfGroup(light), RUNNER_COST_SECONDS.node.control + 2 * RUNNER_COST_SECONDS.node.mutation);
  });

  test("重い組の印は実測の表の行に限る（見積もりだけが大きい組は、重い組として先に配らない）", () => {
    assert.equal(weightOfGroup.isHeavy({ pkg: "scripts", tests: ["test-shuffled.test.mjs"], mutations: [{}] }), true);
    const bigGuess = { pkg: "packages/timer-core", tests: ["test/no-such.test.ts"], mutations: Array.from({ length: 40 }, () => ({})) };
    assert.ok(weightOfGroup(bigGuess) > 30, "見積もりは大きい");
    assert.equal(weightOfGroup.isHeavy(bigGuess), false);
  });

  test("重い組を指す変異が複数あっても、planWorkers は別のワーカーへ分ける", () => {
    const plan = planWorkers(clustered(heavyTests, 3), 4, weightOfGroup);
    assert.deepEqual(plan.map((w) => heavyGroupsIn(w)), [1, 1, 1, 1]);
  });

  test("重い組が 3 つのシャードへ偏らない（1 組ずつ持つ）", () => {
    const muts = clustered(heavyTests.slice(0, 3), 2);
    const counts = [1, 2, 3].map((index) => {
      const { selected } = selectMutations(muts, { kind: "shard", index, total: 3, weightOf: weightOfGroup });
      return heavyGroupsIn(selected.map((s) => s.mutation));
    });
    assert.deepEqual(counts, [1, 1, 1]);
  });

  test("宣言の全件を 3 つに分けたとき、全体の重さ（表の重い組は CI の実測の秒数を手で書いた固定値、ほかは見積もり）が分け前の間で 8% 以内に収まる", () => {
    // 2026-11-05 の CI の実測（組の合計。run 42027659444）。表を引かない・重い組が寄ると、実測で数えた分け前が開く
    const actual = new Map([
      ["scripts :: test-shuffled.test.mjs", 186],
      ["scripts :: audit-test-focus.test.mjs", 66],
      ["scripts :: local-check.test.mjs", 55],
      ["scripts :: lib/toolchain.test.mjs check-toolchain.test.mjs", 35],
      ["apps/agenda-web :: tests/scenario-draft.test.ts tests/scenario-builder.test.tsx", 32],
      ["apps/agenda-web :: tests/agenda-room.test.tsx", 34],
      ["apps/timer-web :: test/ui/App.room-header.test.tsx", 41],
      ["apps/tasuki-sync :: test/ws-adapter-tool-query.test.ts test/live-ws.checkin.test.ts", 32],
      ["packages/markdown :: tests/performance.test.ts", 27],
    ]);
    const loads = [1, 2, 3].map((index) => {
      const { selected } = selectMutations(MUTATIONS, { kind: "shard", index, total: 3, weightOf: weightOfGroup });
      return groupByControl(selected.map((s) => s.mutation)).reduce((sum, g) => sum + (actual.get(groupKeyOf(g)) ?? weightOfGroup(g)), 0);
    });
    const mean = loads.reduce((p, q) => p + q, 0) / loads.length;
    assert.ok((Math.max(...loads) - Math.min(...loads)) / mean <= 0.08, `分け前の重さ: ${loads.map((l) => l.toFixed(0))}`);
  });
});
