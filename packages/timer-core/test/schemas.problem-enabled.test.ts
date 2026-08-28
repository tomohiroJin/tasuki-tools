import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/schemas.js";

describe("config.set の problemEnabled", () => {
  it("problemEnabled=false だけを含む config.set を受理する", () => {
    // Given（config.set の config は v.partial なので単独フィールドでも valid）
    const command = { command: "config.set", config: { problemEnabled: false } };
    // When
    const r = v.safeParse(CommandSchema, command);
    // Then
    expect(r.success).toBe(true);
  });

  // 注: language は列挙ではなく自由文字列（schemas.ts の languageStr = v.pipe(v.string(),
  // v.minLength(1), v.maxLength(MAX_CONFIG_LANGUAGE))）。よって「既定値の言語に無い値」は
  // 拒否理由にならない。既存テストが検証していたのも「language は単独フィールドでも
  // v.partial で valid」という事実であり、それを CommandSchema 経由でも確かめる。
  it("既定の候補に無い言語文字列を含む config.set も受理する（language は自由文字列）", () => {
    // Given
    const command = { command: "config.set", config: { language: "Go" } };
    // When
    const r = v.safeParse(CommandSchema, command);
    // Then
    expect(r.success).toBe(true);
  });
});
