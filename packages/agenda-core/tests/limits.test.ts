import { describe, expect, it } from "vitest";
import {
  EXTEND_MINUTES,
  MAX_ITEMS,
  MAX_SCENARIO_TITLE,
  MAX_STEP_BUDGET_SEC,
  MAX_STEP_NAME,
  MAX_TOTAL_SEC,
  STEP_SEC_GRANULARITY,
  STEP_SEC_MAX,
  STEP_SEC_MIN,
} from "../src/limits.js";

describe("進行タイマーの上限", () => {
  it("各上限の値を固定する", () => {
    expect(MAX_ITEMS).toBe(20);
    expect(MAX_STEP_NAME).toBe(40);
    expect(MAX_SCENARIO_TITLE).toBe(60);
    expect(STEP_SEC_MIN).toBe(60);
    expect(STEP_SEC_MAX).toBe(7200);
    expect(STEP_SEC_GRANULARITY).toBe(60);
    expect(MAX_TOTAL_SEC).toBe(10800);
    expect(MAX_STEP_BUDGET_SEC).toBe(14400);
    expect(EXTEND_MINUTES).toEqual([1, 3, 5]);
  });

  it("合計の上限は個々のステップの上限とは別に効く", () => {
    expect(STEP_SEC_MAX * MAX_ITEMS).toBeGreaterThan(MAX_TOTAL_SEC);
  });

  it("1 ステップの入力の上限は延長込みの上限より小さい", () => {
    expect(STEP_SEC_MAX).toBeLessThan(MAX_STEP_BUDGET_SEC);
  });
});
