/**
 * 支援技術向け離散アナウンスの導出テスト
 * 交代・残り10秒・一時停止を読み上げ可能に（連続カウントは対象外）
 * @requirements FR-035
 */

import { describe, it, expect } from "vitest";
import { deriveAnnouncement } from "../../src/ui/announce.js";

describe("deriveAnnouncement", () => {
  const base = {
    running: true,
    isPaused: false,
    currentIndex: 0,
    isUrgent: false,
    driverName: "Alice",
    onBreak: false,
  };

  it("交代でドライバー名を読み上げる", () => {
    // Given
    const prev = { ...base, currentIndex: 0, driverName: "Alice" };
    const next = { ...base, currentIndex: 1, driverName: "Bob" };
    // When / Then
    expect(deriveAnnouncement(prev, next)).toContain("Bob");
  });

  it("残り10秒に入った瞬間に一度だけ通知する", () => {
    // Given
    const prev = { ...base, isUrgent: false };
    const next = { ...base, isUrgent: true };
    // When / Then
    expect(deriveAnnouncement(prev, next)).toContain("10");
  });

  it("緊急状態が継続している間は再通知しない", () => {
    // Given
    const prev = { ...base, isUrgent: true };
    const next = { ...base, isUrgent: true };
    // When / Then
    expect(deriveAnnouncement(prev, next)).toBeNull();
  });

  it("一時停止を通知する", () => {
    // Given
    const prev = { ...base, isPaused: false };
    const next = { ...base, isPaused: true };
    // When / Then
    expect(deriveAnnouncement(prev, next)).toContain("一時停止");
  });

  it("変化が無ければ通知しない（連続カウントは読み上げない）", () => {
    expect(deriveAnnouncement(base, { ...base })).toBeNull();
  });

  /** @requirements #402 */
  it("Given 走行中 / When 交代と同時に休憩に入る / Then 休憩の文が交代の文より優先する", () => {
    const prev = { running: true, isPaused: false, currentIndex: 0, isUrgent: false, driverName: "A", onBreak: false };
    const next = { running: false, isPaused: false, currentIndex: 1, isUrgent: false, driverName: "B", onBreak: true };
    expect(deriveAnnouncement(prev, next)).toBe("休憩に入りました。休憩明けはBさんです");
  });

  /** @requirements #402 */
  it("Given 休憩中 / When 休憩が終わる / Then 休憩が終わったことといまの運転者を読む", () => {
    const prev = { running: false, isPaused: false, currentIndex: 1, isUrgent: false, driverName: "B", onBreak: true };
    expect(deriveAnnouncement(prev, { ...prev, running: true, onBreak: false })).toBe("休憩が終わりました。ドライバーはBさんです");
  });

  // 休憩明けの繰り上げは同じ snapshot で運転者を替える。休憩の終わりの文が交代の文より優先するので、
  // 終わりの文が運転者を言わないと、新しい運転者が読み上げから落ちる（PR #416 のレビュー）。
  it("Given 休憩中に運転者が席を外した / When 休憩明けに繰り上げで運転者が替わる / Then 新しい運転者を読む", () => {
    const prev = { running: false, isPaused: false, currentIndex: 1, isUrgent: false, driverName: "B", onBreak: true };
    const next = { ...prev, running: true, onBreak: false, currentIndex: 2, driverName: "C" };
    expect(deriveAnnouncement(prev, next)).toBe("休憩が終わりました。ドライバーはCさんです");
  });
});
