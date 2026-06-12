/**
 * CommandSchema の境界バリデーションのテスト
 * host.transfer コマンドの追加分（v2.2 R2-3）を中心に検証する。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/index.js";

describe("CommandSchema host.transfer", () => {
  it("participantId 付きの host.transfer は success", () => {
    const result = v.safeParse(CommandSchema, {
      command: "host.transfer",
      participantId: "p2",
    });
    expect(result.success).toBe(true);
  });

  it("participantId 欠落の host.transfer は failure", () => {
    const result = v.safeParse(CommandSchema, {
      command: "host.transfer",
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionConfigSchema 言語・難易度の境界", () => {
  const baseConfig = {
    members: ["Alice"],
    intervalMinutes: 5,
  };

  it("正常な言語・難易度の config.set を受理する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "TypeScript", difficulty: "easy" },
    });
    expect(result.success).toBe(true);
  });

  it("言語が上限超過（41 字）の config.set を拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "x".repeat(41), difficulty: "easy" },
    });
    expect(result.success).toBe(false);
  });

  it("難易度が上限超過（21 字）の config.set を拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "TypeScript", difficulty: "x".repeat(21) },
    });
    expect(result.success).toBe(false);
  });

  it("巨大な言語文字列（プロンプト膨張狙い）を拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "x".repeat(100_000), difficulty: "easy" },
    });
    expect(result.success).toBe(false);
  });
});
