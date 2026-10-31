import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupByControl, partitionMutations } from "./mutation-partition.mjs";

/**
 * `scripts/lib/mutation-partition.mjs` の自己テスト（#481）。
 *
 * 変異の全件を n 個に分ける。CI のシャード（`--shard k/n`）と、1 つのジョブの中の並列（`--jobs m`）の
 * 両方がこの 1 つの分け方を使う。**分けた n 個を合わせると全件になり、重ならない**ことが要である。
 * ここが崩れると、どこかの変異が黙って一度も流れなくなる（CI は緑のまま）。
 */

/** 造作。対照の組（pkg と tests が同じ）を 3 つ作る。組 A が重く、組 C が軽い。 */
const A1 = { id: 1, pkg: "apps/a", tests: ["t/a.test.ts"] };
const B1 = { id: 2, pkg: "apps/b", tests: ["t/b.test.ts"] };
const A2 = { id: 3, pkg: "apps/a", tests: ["t/a.test.ts"] };
const C1 = { id: 4, pkg: "apps/c", tests: ["t/c.test.ts"] };
const A3 = { id: 5, pkg: "apps/a", tests: ["t/a.test.ts"] };
const B2 = { id: 6, pkg: "apps/b", tests: ["t/b.test.ts"] };
// 同じ pkg でも tests が違えば別の組（対照のコマンドが違う）
const A_OTHER = { id: 7, pkg: "apps/a", tests: ["t/other.test.ts"] };
const MUTS = [A1, B1, A2, C1, A3, B2, A_OTHER];

/** 重さ: 起動 1 回を 1 として、対照 1 回＋変異の件数。 */
const launches = (group) => 1 + group.mutations.length;
const idsOf = (list) => list.map((m) => m.id);

describe("groupByControl: 対照の組にまとめる", () => {
  test("pkg と tests が同じ変異を 1 つの組にし、組は初めに現れた順に並ぶ", () => {
    const groups = groupByControl(MUTS);
    assert.deepEqual(
      groups.map((g) => idsOf(g.mutations)),
      [[1, 3, 5], [2, 6], [4], [7]],
    );
  });

  test("tests の並びが違えば別の組（対照のコマンドの引数が違う）", () => {
    const x = { id: 1, pkg: "p", tests: ["a", "b"] };
    const y = { id: 2, pkg: "p", tests: ["b", "a"] };
    assert.equal(groupByControl([x, y]).length, 2);
  });

  test("組は pkg と tests を持つ（重さの計算でランナーを判定するため）", () => {
    const [first] = groupByControl(MUTS);
    assert.equal(first.pkg, "apps/a");
    assert.deepEqual(first.tests, ["t/a.test.ts"]);
  });
});

describe("partitionMutations: n 個に分ける", () => {
  for (const n of [1, 2, 3, 4]) {
    test(`n=${n}: 合わせると全件で、重ならない`, () => {
      const parts = partitionMutations(MUTS, n, launches);
      assert.equal(parts.length, n);
      const all = parts.flat();
      assert.equal(all.length, MUTS.length, "件数が合わない（重なりか抜け）");
      assert.deepEqual(new Set(idsOf(all)), new Set(idsOf(MUTS)));
    });
  }

  test("対照の組を割らない（同じ組の変異は同じ分け前に入る）", () => {
    const parts = partitionMutations(MUTS, 3, launches);
    for (const part of parts) {
      const ids = new Set(idsOf(part));
      // 組 A（1・3・5）と組 B（2・6）は、まとめて入っているか、まったく入っていないか
      for (const group of [[1, 3, 5], [2, 6]]) {
        const inside = group.filter((id) => ids.has(id)).length;
        assert.ok(inside === 0 || inside === group.length, `組 ${group} が割れた: ${[...ids]}`);
      }
    }
  });

  test("どの分け前も空にならない", () => {
    for (const part of partitionMutations(MUTS, 4, launches)) assert.ok(part.length > 0);
  });

  test("分け前の中は宣言の順に並ぶ", () => {
    for (const part of partitionMutations(MUTS, 2, launches)) {
      const ids = idsOf(part);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    }
  });

  test("同じ入力からは同じ結果になる（どの機械でも同じ割り当て）", () => {
    assert.deepEqual(
      partitionMutations(MUTS, 3, launches).map(idsOf),
      partitionMutations([...MUTS], 3, launches).map(idsOf),
    );
  });

  test("重い組から、いちばん軽い分け前へ入れる（重さに従って偏らない）", () => {
    // 組 A（重さ 4）・組 B（3）・組 A_OTHER（2）・組 C（2）の順に配る（同点の 2 つは鍵の辞書順）。
    // A が 1 つ目、B が 2 つ目、A_OTHER は軽い 2 つ目（3 → 5）、C は軽くなった 1 つ目（4 → 6）へ
    const parts = partitionMutations(MUTS, 2, launches);
    assert.deepEqual(parts.map(idsOf), [
      [1, 3, 4, 5],
      [2, 6, 7],
    ]);
  });

  test("重さが同じなら組の鍵の辞書順で決まり、宣言の並びに左右されない", () => {
    const x = { id: 1, pkg: "apps/x", tests: ["t"] };
    const y = { id: 2, pkg: "apps/y", tests: ["t"] };
    const one = partitionMutations([x, y], 2, launches).map(idsOf);
    const two = partitionMutations([y, x], 2, launches).map(idsOf);
    assert.deepEqual(one, [[1], [2]]);
    assert.deepEqual(two, [[1], [2]]);
  });

  test("渡した重さを使う（重さを無視して件数で配らない）", () => {
    // 件数では組 A（3 件）が最も重いが、重さの関数では組 C を最も重くする
    const heavyC = (g) => (g.pkg === "apps/c" ? 100 : 1);
    const parts = partitionMutations(MUTS, 2, heavyC);
    assert.deepEqual(parts.map(idsOf), [[4], [1, 2, 3, 5, 6, 7]]);
  });

  test("組の数より多くは分けられない（空の分け前を作らない）", () => {
    assert.throws(() => partitionMutations(MUTS, 5, launches), /対照の組が 4 個しかなく、5 個に分けられません/);
  });

  test("n が正の整数でなければエラー", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => partitionMutations(MUTS, bad, launches), /正の整数/, String(bad));
    }
  });

  test("重さが正の有限の数でなければエラー（0 の重さは 1 つの分け前へ寄せてしまう）", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => partitionMutations(MUTS, 2, () => bad), /重さ/, String(bad));
    }
  });
});
