/**
 * 設定ローカル保存のテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  savePreferences,
  loadPreferences,
  clearPreferences,
  loadRandomLanguagePool,
  saveRandomLanguagePool,
  DEFAULT_RANDOM_LANGUAGE_POOL,
  loadNotifyPreferences,
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";

/**
 * @requirements T062, T063, FR-053, FR-054, US10
 */
describe("設定ローカル保存", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("設定を保存して再読み込みできる", () => {
    // Given
    savePreferences({
      displayName: "Alice",
      language: "Python",
      difficulty: "medium",
      members: ["Alice", "Bob"],
      intervalMinutes: 7,
    });

    // When
    const loaded = loadPreferences();

    // Then
    expect(loaded?.displayName).toBe("Alice");
    expect(loaded?.language).toBe("Python");
    expect(loaded?.difficulty).toBe("medium");
    expect(loaded?.members).toEqual(["Alice", "Bob"]);
    expect(loaded?.intervalMinutes).toBe(7);
  });

  it("保存がない場合は null を返す", () => {
    expect(loadPreferences()).toBeNull();
  });

  it("clearPreferences で削除される", () => {
    // Given
    savePreferences({ displayName: "Alice", language: "Go", difficulty: "easy", members: [], intervalMinutes: 5 });
    // When
    clearPreferences();
    // Then
    expect(loadPreferences()).toBeNull();
  });

  it("部分的な設定の保存も機能する（displayName のみ等）", () => {
    // Given
    savePreferences({ displayName: "Bob", language: "TypeScript", difficulty: "easy", members: ["Bob"], intervalMinutes: 5 });
    // When
    const loaded = loadPreferences();
    // Then
    expect(loaded?.displayName).toBe("Bob");
  });
});

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
