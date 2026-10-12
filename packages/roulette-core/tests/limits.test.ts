import { describe, expect, it } from "vitest";
import { MAX_GUESTS, MAX_WHEEL, SETTLE_MAX, SETTLE_MIN, SPIN_DURATION_MS } from "../src/index.js";

/**
 * @requirements #94 spec §5.1（定数）
 */
describe("ルーレットの定数", () => {
  it("回転の長さ・ゲストの上限・円盤の上限は設計どおり", () => {
    expect(SPIN_DURATION_MS).toBe(4000);
    expect(MAX_GUESTS).toBe(12);
    expect(MAX_WHEEL).toBe(24);
  });

  it("止まる位置の揺らぎの範囲は (0,1) の中で下限が上限より小さい", () => {
    expect(SETTLE_MIN).toBeLessThan(SETTLE_MAX);
    expect(SETTLE_MIN).toBeGreaterThan(0);
    expect(SETTLE_MAX).toBeLessThan(1);
  });
});
