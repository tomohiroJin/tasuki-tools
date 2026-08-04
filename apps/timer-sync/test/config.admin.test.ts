import { describe, it, expect } from "vitest";
import { loadSyncConfig } from "../src/config.js";

describe("loadSyncConfig: ADMIN_TOKEN", () => {
  it("ADMIN_TOKEN 未設定なら adminToken は undefined", () => {
    expect(loadSyncConfig({ ALLOWED_ORIGINS: "https://x" }).adminToken).toBeUndefined();
  });
  it("ADMIN_TOKEN 設定時はその値（前後空白除去）", () => {
    expect(loadSyncConfig({ ALLOWED_ORIGINS: "https://x", ADMIN_TOKEN: " secret123 " }).adminToken).toBe("secret123");
  });
  it("空白のみの ADMIN_TOKEN は undefined 扱い（無効化）", () => {
    expect(loadSyncConfig({ ALLOWED_ORIGINS: "https://x", ADMIN_TOKEN: "   " }).adminToken).toBeUndefined();
  });
});
