import { describe, it, expect } from "vitest";
import { shouldClearGenerating } from "../../src/ui/problem-generation.js";
import type { Problem } from "@tdd-mob/core";

const mk = (title: string, source?: Problem["source"]): Problem => ({
  title,
  description: "d",
  requirements: ["a", "b", "c"],
  exampleTest: "t",
  hints: ["h"],
  ...(source ? { source } : {}),
});

describe("shouldClearGenerating", () => {
  it("生成中で title が変化したら true", () => {
    expect(shouldClearGenerating(true, mk("旧"), mk("新"))).toBe(true);
  });
  it("生成中で source が変化したら true（title 同じでも）", () => {
    expect(shouldClearGenerating(true, mk("同", "fallback"), mk("同", "ai"))).toBe(true);
  });
  it("生成中で null→problem（初回確定）は true", () => {
    expect(shouldClearGenerating(true, null, mk("初"))).toBe(true);
  });
  it("生成中だが title も source も不変なら false（無関係 snapshot）", () => {
    expect(shouldClearGenerating(true, mk("同", "ai"), mk("同", "ai"))).toBe(false);
  });
  it("非生成中なら常に false", () => {
    expect(shouldClearGenerating(false, mk("旧"), mk("新"))).toBe(false);
  });
  it("生成中で problem が両方 null なら false", () => {
    expect(shouldClearGenerating(true, null, null)).toBe(false);
  });
});
