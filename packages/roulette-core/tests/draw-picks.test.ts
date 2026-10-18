import { describe, expect, it } from "vitest";
import { drawPicks as drawPicksResult } from "../src/draw.js";
import type { Entry } from "../src/index.js";

const A: Entry = { id: "p-a", name: "あおい" };
const B: Entry = { id: "p-b", name: "健太" };
const C: Entry = { id: "p-c", name: "Ren" };
const D: Entry = { id: "p-d", name: "Mika" };
const E: Entry = { id: "p-e", name: "陽菜" };

/** 契約を守る乱数での引き（取り出せなければ前提の誤りとして落ちる） */
const drawPicks = (...args: Parameters<typeof drawPicksResult>) => drawPicksResult(...args)._unsafeUnwrap();

/** 常に 0 を返す偽の乱数。「先頭」を引き続ける最悪の偏りを作る */
const alwaysZero = (): number => 0;

const idsOf = (pool: readonly Entry[], indices: readonly number[]): string[] => indices.map((i) => pool[i]?.id ?? "?");

/**
 * @requirements #427 設計 F（一周の規則を外す・「同じ人が何度も当たることがあるのがルーレット」）
 */
describe("drawPicks（k 人を引く）", () => {
  it("Review Focus 5: 入る人 2 人・選ぶ人数 1 で、randomInt が毎回 0 を返すと同じ人が続けて選ばれる", () => {
    // Given: 2 人・k = 1
    // When: 3 回続けて引く（前の回転の当たりは覚えない）
    const rounds = [0, 1, 2].map(() => idsOf([A, B], drawPicks([A, B], 1, alwaysZero)));
    // Then: 毎回先頭の A
    expect(rounds).toEqual([["p-a"], ["p-a"], ["p-a"]]);
  });

  it("1 回の回転では同じ人を 2 度選ばない（k = 4・pool = 5）", () => {
    // Given: 5 人・k = 4。乱数の位置を総当たりに近く振る
    const pool = [A, B, C, D, E];
    for (const at of [0, 1, 2, 3, 4]) {
      // When: 候補の数より小さい位置（末尾に丸める）を返す乱数
      const picks = drawPicks(pool, 4, (n) => Math.min(at, n - 1));
      // Then: 4 人は互いに異なる
      expect(new Set(picks).size).toBe(4);
    }
    // 先頭を引き続けても、末尾を引き続けても重ならない
    expect(idsOf(pool, drawPicks(pool, 4, alwaysZero))).toEqual(["p-a", "p-b", "p-c", "p-d"]);
    expect(new Set(drawPicks(pool, 4, (n) => n - 1)).size).toBe(4);
  });

  it("候補の数を randomInt に渡す（k 回目は pool − (k−1)）", () => {
    // Given: 4 人・k = 3
    const calls: number[] = [];
    // When
    drawPicks([A, B, C, D], 3, (n) => {
      calls.push(n);
      return 0;
    });
    // Then
    expect(calls).toEqual([4, 3, 2]);
  });

  it("k = 1 は毎回入る人全員から一様に引く（randomInt の位置がそのまま当たり）", () => {
    // Given / When / Then
    const pool = [A, B, C];
    expect([0, 1, 2].map((at) => drawPicks(pool, 1, () => at))).toEqual([[0], [1], [2]]);
  });

  it("randomInt が範囲外なら INVALID_RANDOM", () => {
    // Given / When
    const r = drawPicksResult([A, B, C], 2, (n) => n);
    // Then
    expect(r._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
  });
});
