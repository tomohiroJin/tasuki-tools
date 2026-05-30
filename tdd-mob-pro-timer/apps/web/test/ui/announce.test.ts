/**
 * 支援技術向け離散アナウンスの導出テスト
 * FR-035: 交代・残り10秒・一時停止・休憩を読み上げ可能に（連続カウントは対象外）
 */

import { describe, it, expect } from "vitest";
import { deriveAnnouncement } from "../../src/ui/announce.js";

describe("deriveAnnouncement", () => {
  const base = {
    running: true,
    isPaused: false,
    onBreak: false,
    currentIndex: 0,
    isUrgent: false,
    driverName: "Alice",
  };

  it("交代でドライバー名を読み上げる", () => {
    const prev = { ...base, currentIndex: 0, driverName: "Alice" };
    const next = { ...base, currentIndex: 1, driverName: "Bob" };
    expect(deriveAnnouncement(prev, next)).toContain("Bob");
  });

  it("残り10秒に入った瞬間に一度だけ通知する", () => {
    const prev = { ...base, isUrgent: false };
    const next = { ...base, isUrgent: true };
    expect(deriveAnnouncement(prev, next)).toContain("10");
  });

  it("緊急状態が継続している間は再通知しない", () => {
    const prev = { ...base, isUrgent: true };
    const next = { ...base, isUrgent: true };
    expect(deriveAnnouncement(prev, next)).toBeNull();
  });

  it("一時停止を通知する", () => {
    const prev = { ...base, isPaused: false };
    const next = { ...base, isPaused: true };
    expect(deriveAnnouncement(prev, next)).toContain("一時停止");
  });

  it("休憩開始を通知する", () => {
    const prev = { ...base, onBreak: false };
    const next = { ...base, onBreak: true };
    expect(deriveAnnouncement(prev, next)).toContain("休憩");
  });

  it("変化が無ければ通知しない（連続カウントは読み上げない）", () => {
    expect(deriveAnnouncement(base, { ...base })).toBeNull();
  });
});
