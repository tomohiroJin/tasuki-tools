/**
 * 端末ローカル設定（言語プール・交代通知）のテスト。
 *
 * **セッション設定の保存（`SavedPreferences`）のテストは #272 で畳んだ。**
 * 実装ごと畳んだためである（要求 FR-053 / FR-054 は玄関側へ預けた。
 * `apps/timer-web/src/prefs/local-prefs.ts` の冒頭を参照）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadRandomLanguagePool,
  saveRandomLanguagePool,
  DEFAULT_RANDOM_LANGUAGE_POOL,
  loadNotifyPreferences,
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";

describe("randomLanguagePool", () => {
  beforeEach(() => localStorage.clear());

  it("未保存なら既定プール（常用5言語）を返す", () => {
    // Given（beforeEach で保存なしの状態）
    // When
    const pool = loadRandomLanguagePool();
    // Then
    expect(pool).toEqual(DEFAULT_RANDOM_LANGUAGE_POOL);
    expect(DEFAULT_RANDOM_LANGUAGE_POOL).toEqual([
      "TypeScript", "JavaScript", "Python", "Go", "Java",
    ]);
  });
  it("保存した内容を読み戻せる", () => {
    saveRandomLanguagePool(["Go", "Rust"]);
    expect(loadRandomLanguagePool()).toEqual(["Go", "Rust"]);
  });
  it("空配列も保存・読込できる", () => {
    saveRandomLanguagePool([]);
    expect(loadRandomLanguagePool()).toEqual([]);
  });
  it("壊れた JSON は既定プールにフォールバック", () => {
    localStorage.setItem("tdd-mob:random-language-pool:v1", "{not json");
    expect(loadRandomLanguagePool()).toEqual(DEFAULT_RANDOM_LANGUAGE_POOL);
  });
});

/**
 * @requirements Issue #5
 */
describe("NotifyPreferences の countdownMode/countdownVoiceId", () => {
  beforeEach(() => localStorage.clear());

  it("既定値は countdownMode: tone / countdownVoiceId: voice-male", () => {
    // Given（beforeEach で保存なしの状態）
    // When
    const prefs = loadNotifyPreferences();
    // Then
    expect(prefs.countdownMode).toBe("tone");
    expect(prefs.countdownVoiceId).toBe("voice-male");
  });

  it("保存した countdownMode/countdownVoiceId を読み戻せる", () => {
    // Given
    saveNotifyPreferences({ ...DEFAULT_NOTIFY_PREFERENCES, countdownMode: "voice", countdownVoiceId: "voice-female" });
    // When
    const prefs = loadNotifyPreferences();
    // Then
    expect(prefs.countdownMode).toBe("voice");
    expect(prefs.countdownVoiceId).toBe("voice-female");
  });

  it("破損した保存値は countdownMode/countdownVoiceId とも既定値にフォールバックする", () => {
    // Given
    localStorage.setItem("tdd-mob:notify:v1", JSON.stringify({ countdownMode: 123, countdownVoiceId: null }));
    // When
    const prefs = loadNotifyPreferences();
    // Then
    expect(prefs.countdownMode).toBe("tone");
    expect(prefs.countdownVoiceId).toBe("voice-male");
  });
});
