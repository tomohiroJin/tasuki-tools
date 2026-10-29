import { describe, expect, it } from "vitest";
import {
  MAX_GUESTS,
  MAX_PICK,
  MAX_WHEEL,
  NEXT_MOVE_MS,
  SETTLE_MAX,
  SETTLE_MIN,
  SPIN_DURATION_MS,
  STOP_HOLD_MS,
  pickStopsMs,
  spinDurationMs,
} from "../src/limits.js";

/**
 * @requirements #94 spec §5.1（定数）
 */
describe("ルーレットの定数", () => {
  it("回転の長さ・ゲストの上限・円盤の上限は設計どおり", () => {
    // Given: 定数
    // When: 読む
    // Then
    expect(SPIN_DURATION_MS).toBe(4000);
    expect(MAX_GUESTS).toBe(24);
    expect(MAX_WHEEL).toBe(24);
  });

  it("止まる位置の揺らぎの範囲は (0,1) の中で下限が上限より小さい", () => {
    // Given: 定数
    // When: 読む
    // Then
    expect(SETTLE_MIN).toBeLessThan(SETTLE_MAX);
    expect(SETTLE_MIN).toBeGreaterThan(0);
    expect(SETTLE_MAX).toBeLessThan(1);
  });
});

/**
 * @requirements #401 spec M5・M6・E7（選ぶ人数と回転の長さ）
 */
describe("選ぶ人数と回転の長さ", () => {
  it("選ぶ人数の上限は 4", () => {
    // Given: 定数
    // When: 読む
    // Then
    expect(MAX_PICK).toBe(4);
  });

  it("1 人を選ぶ回転の長さは #94 と同じ", () => {
    // Given: 選ぶ人数 1
    // When
    const ms = spinDurationMs(1);
    // Then
    expect(ms).toBe(SPIN_DURATION_MS);
  });

  it("2 人目からは 1 人ごとに「置く」と「送る」の時間が足される", () => {
    // Given: 選ぶ人数 2・4
    // When
    // Then
    expect(spinDurationMs(2)).toBe(SPIN_DURATION_MS + STOP_HOLD_MS + NEXT_MOVE_MS);
    expect(spinDurationMs(4)).toBe(SPIN_DURATION_MS + 3 * (STOP_HOLD_MS + NEXT_MOVE_MS));
  });
});

/**
 * @requirements #401 E8（止まる時刻の正本を 1 つにする・画面とサーバーが同じ表を読む）
 */
describe("止まる時刻の表", () => {
  it("1 人目は #94 の長さで止まり、2 人目からは「置く」＋「送る」ずつ後ろで止まる", () => {
    // Given / When / Then
    expect(pickStopsMs(1)).toEqual([SPIN_DURATION_MS]);
    expect(pickStopsMs(3)).toEqual([
      SPIN_DURATION_MS,
      SPIN_DURATION_MS + STOP_HOLD_MS + NEXT_MOVE_MS,
      SPIN_DURATION_MS + 2 * (STOP_HOLD_MS + NEXT_MOVE_MS),
    ]);
  });

  it("回転の全体の長さは最後の人が止まる時刻", () => {
    // Given / When / Then
    for (let k = 1; k <= MAX_PICK; k++) expect(spinDurationMs(k)).toBe(pickStopsMs(k).at(-1));
  });
});
