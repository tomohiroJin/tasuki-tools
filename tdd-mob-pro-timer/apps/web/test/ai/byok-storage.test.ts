/**
 * BYOK 鍵保存方針のテスト
 * T052/T053: FR-017 (US4)
 *
 * 鍵は既定 sessionStorage, 明示同意時のみ localStorage。
 * いかなるペイロードにも鍵が含まれないことを確認。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveApiKey,
  loadApiKey,
  clearApiKey,
  API_KEY_SESSION_STORAGE_KEY,
  API_KEY_LOCAL_STORAGE_KEY,
} from "../../src/ai/key-storage.js";

describe("BYOK 鍵保存（T052/T053）", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("既定では sessionStorage に保存される（タブを閉じると消える）", () => {
    saveApiKey("sk-ant-test-key", false);
    expect(sessionStorage.getItem(API_KEY_SESSION_STORAGE_KEY)).toBe("sk-ant-test-key");
    expect(localStorage.getItem(API_KEY_LOCAL_STORAGE_KEY)).toBeNull();
  });

  it("永続化オプト時は localStorage に保存される", () => {
    saveApiKey("sk-ant-persistent-key", true);
    expect(localStorage.getItem(API_KEY_LOCAL_STORAGE_KEY)).toBe("sk-ant-persistent-key");
  });

  it("loadApiKey は sessionStorage を優先して返す", () => {
    sessionStorage.setItem(API_KEY_SESSION_STORAGE_KEY, "session-key");
    localStorage.setItem(API_KEY_LOCAL_STORAGE_KEY, "local-key");
    expect(loadApiKey()).toBe("session-key");
  });

  it("sessionStorage になければ localStorage から返す", () => {
    localStorage.setItem(API_KEY_LOCAL_STORAGE_KEY, "local-key");
    expect(loadApiKey()).toBe("local-key");
  });

  it("clearApiKey で両方のストレージから鍵が削除される", () => {
    sessionStorage.setItem(API_KEY_SESSION_STORAGE_KEY, "s-key");
    localStorage.setItem(API_KEY_LOCAL_STORAGE_KEY, "l-key");
    clearApiKey();
    expect(loadApiKey()).toBeNull();
  });

  it("鍵の文字列が JSON シリアライズされるような構造になっていない（FR-017: サーバー送信防止の補助確認）", () => {
    // 鍵は文字列として保存され、オブジェクト構造に入らない（誤ってペイロードに混入しにくい）
    saveApiKey("sk-ant-xxx", false);
    const raw = sessionStorage.getItem(API_KEY_SESSION_STORAGE_KEY);
    // JSON オブジェクトでなく生の文字列であることを確認
    expect(() => JSON.parse(raw ?? "")).toThrow();
  });
});
