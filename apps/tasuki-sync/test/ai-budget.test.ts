/**
 * AI の予算（有効・無効）の判断のテスト（#459）。
 * API キーと解錠の合言葉が両方あるときだけ AI は有効で、片方でも欠ければ無効（定型バンクへ縮退）。
 */
import { describe, it, expect } from "bun:test";
import { loadSyncConfig } from "../src/config.js";
import { createAiBudget } from "../src/assembly/topic.js";
import { FakeClock } from "../src/adapters/system-clock.js";

function budgetFor(env: Record<string, string>) {
  return createAiBudget({ config: loadSyncConfig(env), clock: new FakeClock() });
}

describe("createAiBudget", () => {
  it("API キーと合言葉が両方あれば有効", () => {
    const b = budgetFor({ ANTHROPIC_API_KEY: "sk-ant-api03-x", AI_UNLOCK_KEY: "himitsu" });
    expect(b.aiReady).toBe(true);
    expect(b.aiLimiter).toBeDefined();
  });

  it("API キーが無ければ、合言葉があっても無効（定型へ縮退）", () => {
    const b = budgetFor({ AI_UNLOCK_KEY: "himitsu" });
    expect(b.aiReady).toBe(false);
    expect(b.aiLimiter).toBeUndefined();
  });

  it("旧 OAuth トークンだけでも無効", () => {
    const b = budgetFor({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-old", AI_UNLOCK_KEY: "himitsu" });
    expect(b.aiReady).toBe(false);
  });

  it("合言葉が無ければ、API キーがあっても無効", () => {
    const b = budgetFor({ ANTHROPIC_API_KEY: "sk-ant-api03-x" });
    expect(b.aiReady).toBe(false);
  });
});
