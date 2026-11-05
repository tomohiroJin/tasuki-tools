import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURED_GROUPS, measuredCostOf, HEAVY_RUN_SECONDS } from "./mutation-weights.mjs";
import { weightOfGroup, isHeavyGroup, RUNNER_COST_SECONDS } from "../mutation-check.mjs";
import { MUTATIONS } from "./mutation-declarations.mjs";
import { selectMutations } from "./mutation-select.mjs";
import { groupByControl, controlGroupKey } from "./mutation-partition.mjs";
import { planWorkers } from "./mutation-parallel.mjs";

/**
 * `scripts/lib/mutation-weights.mjs` の自己テスト（#546）。
 * 重い組の実測の秒数の表と、その引き方、見積もり（`weightOfGroup`）が表を使って分け方に効く配線を見る。
 * （`scripts/mutation-check.test.mjs` を変異の `tests` に置くと、変異検査の中で流した対照実行が落ちた（#546 で確認）。
 * 変異で守るために、この配線の検査はこのファイルへ置く）
 */

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("measuredCostOf: 表の引き方", () => {
  test("表にある組は実測の秒数を返し、無い組は null（呼び出し側が既定値へ倒す）", () => {
    const row = MEASURED_GROUPS[0];
    assert.deepEqual(measuredCostOf({ pkg: row.pkg, tests: [...row.tests] }), { control: row.control, mutation: row.mutation });
    assert.equal(measuredCostOf({ pkg: "scripts", tests: ["no-such-heavy.test.mjs"] }), null);
  });

  test("テストの並びが違えば別の組（部分一致で拾わない）", () => {
    assert.equal(measuredCostOf({ pkg: "scripts", tests: ["test-shuffled.test.mjs", "x.test.mjs"] }), null);
  });

  test("置き場が違えば別の組", () => {
    assert.equal(measuredCostOf({ pkg: "apps/other", tests: ["test-shuffled.test.mjs"] }), null);
  });
});

describe("MEASURED_GROUPS: 表そのものの形", () => {
  test("表は空でなく、凍結されている（実行中に書き換えられない）", () => {
    assert.ok(MEASURED_GROUPS.length > 0);
    assert.ok(Object.isFrozen(MEASURED_GROUPS));
  });

  test("どの行も正の有限の秒数で、対照と検出の両方を持つ", () => {
    for (const row of MEASURED_GROUPS) {
      for (const field of ["control", "mutation"]) {
        assert.ok(Number.isFinite(row[field]) && row[field] > 0, `${row.pkg} ${row.tests}: ${field}=${row[field]}`);
      }
    }
  });

  test("どの行も、同じ pkg・tests の組として引ける（表の鍵が行のとおりに作られる）", () => {
    for (const row of MEASURED_GROUPS) {
      assert.deepEqual(measuredCostOf({ pkg: row.pkg, tests: [...row.tests] }), { control: row.control, mutation: row.mutation }, `${row.pkg} ${row.tests}`);
    }
  });

  test("鍵が重ならない（同じ組を 2 行で持たない）", () => {
    const keys = MEASURED_GROUPS.map(controlGroupKey);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("載せるのは重い組だけ（対照 1 回＋検出 1 回が、いちばん重い既定値（vitest）を超える。軽い組は既定値で足りる）", () => {
    for (const row of MEASURED_GROUPS) {
      assert.ok(row.control + row.mutation >= HEAVY_RUN_SECONDS, `${row.pkg} ${row.tests}: ${row.control + row.mutation} 秒は軽すぎる`);
    }
  });

  test("鍵のテストファイルが実在する（消した・改名したファイルの行を残さない）", () => {
    for (const row of MEASURED_GROUPS) {
      for (const file of row.tests) {
        assert.ok(fs.existsSync(path.join(WORKSPACE_ROOT, row.pkg, file)), `${row.pkg}: ${file} が無い`);
      }
    }
  });

  test("表の行がすべて、宣言の組の鍵と一致する（tests の並びを変えて行が黙って効かなくならない。変異の無い組は載せない）", () => {
    const declared = new Set(groupByControl(MUTATIONS).map((g) => g.key));
    for (const row of MEASURED_GROUPS) assert.ok(declared.has(controlGroupKey(row)), `${row.pkg} ${row.tests} は宣言のどの組とも一致しない（表の行を直すか、消す）`);
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
    assert.equal(isHeavyGroup({ pkg: "scripts", tests: ["test-shuffled.test.mjs"], mutations: [{}] }), true);
    const bigGuess = { pkg: "packages/timer-core", tests: ["test/no-such.test.ts"], mutations: Array.from({ length: 40 }, () => ({})) };
    assert.ok(weightOfGroup(bigGuess) > 30, "見積もりは大きい");
    assert.equal(isHeavyGroup(bigGuess), false);
  });

  test("重い組を指す変異が複数あっても、planWorkers は別のワーカーへ分ける", () => {
    const plan = planWorkers(clustered(heavyTests, 3), 4, weightOfGroup, isHeavyGroup);
    assert.deepEqual(plan.map((w) => heavyGroupsIn(w)), [1, 1, 1, 1]);
  });

  test("重い組が 3 つのシャードへ偏らない（1 組ずつ持つ）", () => {
    const muts = clustered(heavyTests.slice(0, 3), 2);
    const counts = [1, 2, 3].map((index) => {
      const { selected } = selectMutations(muts, { kind: "shard", index, total: 3, weightOf: weightOfGroup, isHeavy: isHeavyGroup });
      return heavyGroupsIn(selected.map((s) => s.mutation));
    });
    assert.deepEqual(counts, [1, 1, 1]);
  });
});
