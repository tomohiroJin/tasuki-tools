/**
 * 節目演出ロジックのテスト
 * T041/T042: FR-025,031 (US7)
 */

import { describe, it, expect } from "vitest";
import {
  getUrgentClass,
  getSwitchTransitionClass,
  getReducedMotionClass,
} from "../../src/ui/stage-transitions.js";

describe("節目演出ロジック（T041）", () => {
  it("残り時間 > 10秒 のとき緊急クラスを返さない", () => {
    expect(getUrgentClass(11, true)).toBe("");
    expect(getUrgentClass(30, true)).toBe("");
  });

  it("残り時間 ≤ 10秒 かつ稼働中のとき緊急クラスを返す", () => {
    const cls = getUrgentClass(10, true);
    expect(cls).toContain("urgent");
  });

  it("停止中（isPaused等）は緊急表示しない", () => {
    expect(getUrgentClass(5, false)).toBe("");
  });

  it("交代アニメーションクラスは 'switch' を含む", () => {
    expect(getSwitchTransitionClass()).toContain("switch");
  });

  it("reduced-motion 時は演出を控えめクラスに切り替える（FR-025）", () => {
    const normal = getReducedMotionClass(false);
    const reduced = getReducedMotionClass(true);
    expect(normal).not.toBe(reduced);
    expect(reduced).toContain("reduced");
  });
});
