/**
 * 設定ローカル保存のテスト
 * T062/T063: FR-053,054 (US10)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  savePreferences,
  loadPreferences,
  clearPreferences,
  loadRandomLanguagePool,
  saveRandomLanguagePool,
  DEFAULT_RANDOM_LANGUAGE_POOL,
} from "../../src/prefs/local-prefs.js";

describe("設定ローカル保存（T062/T063）", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("設定を保存して再読み込みできる（FR-053/054）", () => {
    savePreferences({
      displayName: "Alice",
      language: "Python",
      difficulty: "medium",
      members: ["Alice", "Bob"],
      intervalMinutes: 7,
    });

    const loaded = loadPreferences();
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
    savePreferences({ displayName: "Alice", language: "Go", difficulty: "easy", members: [], intervalMinutes: 5 });
    clearPreferences();
    expect(loadPreferences()).toBeNull();
  });

  it("部分的な設定の保存も機能する（displayName のみ等）", () => {
    savePreferences({ displayName: "Bob", language: "TypeScript", difficulty: "easy", members: ["Bob"], intervalMinutes: 5 });
    const loaded = loadPreferences();
    expect(loaded?.displayName).toBe("Bob");
  });
});

describe("randomLanguagePool", () => {
  beforeEach(() => localStorage.clear());

  it("未保存なら既定プール（常用5言語）を返す", () => {
    expect(loadRandomLanguagePool()).toEqual(DEFAULT_RANDOM_LANGUAGE_POOL);
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
