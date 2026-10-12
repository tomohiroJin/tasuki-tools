import { describe, expect, it } from "bun:test";
import { SETTLE_MAX, SETTLE_MIN } from "@tasuki/roulette-core";
import { createCryptoRandomSource } from "../src/adapters/crypto-random-source.js";

/**
 * @requirements #94 R4（乱数の権威はサーバー）
 */
describe("crypto の乱数源", () => {
  it("randomInt(n) は [0, n) の整数で、n=1 なら常に 0、n=24 では全ての値が出る", () => {
    // Given
    const random = createCryptoRandomSource();

    // When
    const draws = Array.from({ length: 2000 }, () => random.randomInt(24));

    // Then: 範囲外が無く、偏って 1 つの値に張り付いていない
    expect(draws.every((d) => Number.isInteger(d) && d >= 0 && d < 24)).toBe(true);
    expect(new Set(draws).size).toBe(24);
    expect(random.randomInt(1)).toBe(0);
  });

  it("randomSettle() は SETTLE_MIN〜SETTLE_MAX の範囲に収まり、範囲の両半分に出る", () => {
    // Given
    const random = createCryptoRandomSource();

    // When
    const draws = Array.from({ length: 1000 }, () => random.randomSettle());

    // Then
    expect(draws.every((d) => d >= SETTLE_MIN && d <= SETTLE_MAX)).toBe(true);
    const mid = (SETTLE_MIN + SETTLE_MAX) / 2;
    expect(draws.some((d) => d < mid)).toBe(true);
    expect(draws.some((d) => d > mid)).toBe(true);
  });
});
