import { describe, it, expect } from "bun:test";
import { loadSyncConfig } from "../src/config.js";

describe("AI お題生成の設定", () => {
  it("未設定なら aiUnlockKey/anthropicApiKey は undefined・他は既定値", () => {
    // Given
    const env = {};
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.aiUnlockKey).toBeUndefined();
    expect(c.anthropicApiKey).toBeUndefined();
    expect(c.aiProblemModel).toBe("sonnet");
    expect(c.aiGenerationTimeoutMs).toBe(60_000);
    expect(c.aiDailyLimit).toBe(100);
  });

  it("空白のみの AI_UNLOCK_KEY は未設定扱い", () => {
    const c = loadSyncConfig({ AI_UNLOCK_KEY: "   " });
    expect(c.aiUnlockKey).toBeUndefined();
  });

  it("空白のみの ANTHROPIC_API_KEY は未設定扱い", () => {
    const c = loadSyncConfig({ ANTHROPIC_API_KEY: "   " });
    expect(c.anthropicApiKey).toBeUndefined();
  });

  it("旧 OAuth トークンだけでは AI は有効にならない（#459: 認証は API キーだけ）", () => {
    const c = loadSyncConfig({ AI_UNLOCK_KEY: "himitsu", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-old" });
    expect(c.anthropicApiKey).toBeUndefined();
  });

  it("設定値が反映される（trim 込み）", () => {
    // Given
    const env = {
      AI_UNLOCK_KEY: " himitsu ",
      ANTHROPIC_API_KEY: " sk-ant-api03-xxx ",
      AI_PROBLEM_MODEL: "haiku",
      AI_GENERATION_TIMEOUT_MS: "30000",
      AI_DAILY_LIMIT: "5",
    };
    // When
    const c = loadSyncConfig(env);
    // Then
    expect(c.aiUnlockKey).toBe("himitsu");
    expect(c.anthropicApiKey).toBe("sk-ant-api03-xxx");
    expect(c.aiProblemModel).toBe("haiku");
    expect(c.aiGenerationTimeoutMs).toBe(30_000);
    expect(c.aiDailyLimit).toBe(5);
  });

  it("AI_DAILY_LIMIT=0 は 0 として通る（その日の生成を全面停止）", () => {
    const c = loadSyncConfig({ AI_DAILY_LIMIT: "0" });
    expect(c.aiDailyLimit).toBe(0);
  });

  it("AI_DAILY_LIMIT が負数・非数値なら既定 100 にフォールバックする", () => {
    expect(loadSyncConfig({ AI_DAILY_LIMIT: "-1" }).aiDailyLimit).toBe(100);
    expect(loadSyncConfig({ AI_DAILY_LIMIT: "abc" }).aiDailyLimit).toBe(100);
  });
});
