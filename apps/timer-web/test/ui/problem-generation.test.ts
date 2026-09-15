import { describe, it, expect } from "vitest";
import {
  isRotationRepresentative,
  shouldAutoRequestProblem,
  shouldClearGenerating,
} from "../../src/ui/problem-generation.js";
import type { Problem } from "@tasuki/timer-core";

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

describe("shouldAutoRequestProblem", () => {
  const base = { phase: "lobby", hasProblem: false, isRepresentative: true, alreadyRequested: false, problemEnabled: true };

  it("ロビーでお題未確定・代表・未要求・お題有効なら true", () => {
    expect(shouldAutoRequestProblem({ ...base, phase: "ready" })).toBe(true);
    expect(shouldAutoRequestProblem({ ...base, phase: "setup" })).toBe(true);
  });
  it("problemEnabled=false なら false（お題なし開始）", () => {
    expect(shouldAutoRequestProblem({ ...base, phase: "ready", problemEnabled: false })).toBe(false);
  });
  it("既にお題があれば false", () => {
    expect(shouldAutoRequestProblem({ ...base, phase: "ready", hasProblem: true })).toBe(false);
  });
  it("代表以外/要求済みは false", () => {
    expect(shouldAutoRequestProblem({ ...base, phase: "ready", isRepresentative: false })).toBe(false);
    expect(shouldAutoRequestProblem({ ...base, phase: "ready", alreadyRequested: true })).toBe(false);
  });
  it("session フェーズでは false", () => {
    expect(shouldAutoRequestProblem({ ...base, phase: "session" })).toBe(false);
  });
});

describe("isRotationRepresentative", () => {
  it("輪の先頭が自分なら true", () => {
    // Given / When / Then（問い合わせがそのまま検証になる）
    expect(isRotationRepresentative("me", ["me", "other"])).toBe(true);
  });

  it("輪に居ても先頭でなければ false", () => {
    expect(isRotationRepresentative("me", ["other", "me"])).toBe(false);
  });

  it("輪が空なら false", () => {
    expect(isRotationRepresentative("me", [])).toBe(false);
  });

  it("participantId が未確定（空文字）なら false（空の輪と突き合わせて真にしない）", () => {
    // Given: identity 未受信。**`rotation[0]` も undefined の側で一致させない**
    // When / Then
    expect(isRotationRepresentative("", [])).toBe(false);
  });
});
