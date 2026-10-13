/**
 * `member.shuffle` の順列の生成（`room-commands/shuffle-order.ts`・#366 で handlers.ts から移した）。
 * 乱数を使うので、並びそのものではなく性質を見る（何度か作って確かめる）。
 */
import { describe, expect, it } from "bun:test";
import { buildShuffleOrder } from "../src/application/room-commands/shuffle-order.js";
import { testRandom } from "./support/test-clocks.js";

const isPermutation = (order: number[], len: number) =>
  [...order].sort((a, b) => a - b).every((v, i) => v === i) && order.length === len;

describe("buildShuffleOrder", () => {
  it("Given 止まっている 5 人の輪 / When 何度か作る / Then いつも 0..4 の順列", () => {
    for (let n = 0; n < 50; n++) {
      // When
      const order = buildShuffleOrder(5, false, 2, testRandom.randomInt);
      // Then
      expect(isPermutation(order, 5)).toBe(true);
    }
  });

  it("Given 動いている 5 人の輪・現ドライバーは 2 番 / When 何度か作る / Then 順列で、2 番はその位置のまま", () => {
    for (let n = 0; n < 50; n++) {
      // When
      const order = buildShuffleOrder(5, true, 2, testRandom.randomInt);
      // Then
      expect(isPermutation(order, 5)).toBe(true);
      expect(order[2]).toBe(2);
    }
  });

  it("Given 1 人以下の輪 / When 作る / Then そのままの並び", () => {
    expect(buildShuffleOrder(1, true, 0, testRandom.randomInt)).toEqual([0]);
    expect(buildShuffleOrder(0, false, 0, testRandom.randomInt)).toEqual([]);
  });
});
