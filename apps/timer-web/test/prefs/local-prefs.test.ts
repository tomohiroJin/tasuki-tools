/**
 * 端末ローカル設定（言語プール・交代通知）のテスト。
 *
 * **セッション設定の保存（`SavedPreferences`）のテストは #272 で畳んだ。**
 * 実装ごと畳んだためである（要求 FR-053 / FR-054 は玄関側へ預けた。
 * `apps/timer-web/src/prefs/local-prefs.ts` の冒頭を参照）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadNotifyPreferences,
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";

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
