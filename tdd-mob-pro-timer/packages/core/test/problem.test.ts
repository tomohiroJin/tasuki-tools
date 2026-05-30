/**
 * お題関連のテスト
 * T022: FR-023, FR-024
 */

import { describe, it, expect } from "vitest";
import {
  validateProblem,
  pickFallback,
  FALLBACK_PROBLEMS,
} from "../src/problem.js";

describe("validateProblem: Valibot検証", () => {
  it("正常なお題は Ok を返す", () => {
    const result = validateProblem({
      title: "FizzBuzz",
      description: "実装してください",
      requirements: ["3の倍数はFizz"],
      exampleTest: "expect(fizzBuzz(3)).toBe('Fizz')",
      hints: [],
    });
    expect(result.isOk()).toBe(true);
  });

  it("title が空の場合は Err を返す", () => {
    const result = validateProblem({
      title: "",
      description: "desc",
      requirements: [],
      exampleTest: "test",
      hints: [],
    });
    expect(result.isErr()).toBe(true);
  });

  it("description が欠けている場合は Err を返す", () => {
    const result = validateProblem({
      title: "test",
      description: "",
      requirements: [],
      exampleTest: "test",
      hints: [],
    });
    expect(result.isErr()).toBe(true);
  });

  it("exampleTest が欠けている場合は Err を返す", () => {
    const result = validateProblem({
      title: "test",
      description: "desc",
      requirements: [],
      exampleTest: "",
      hints: [],
    });
    expect(result.isErr()).toBe(true);
  });

  it("requirements が配列でない場合は Err を返す", () => {
    const result = validateProblem({
      title: "test",
      description: "desc",
      requirements: "not an array" as never,
      exampleTest: "test",
      hints: [],
    });
    expect(result.isErr()).toBe(true);
  });

  it("不正な JSON 文字列は Err を返す（AI 由来のテキストを信頼しない FR-023）", () => {
    const result = validateProblem("invalid json" as never);
    expect(result.isErr()).toBe(true);
  });
});

describe("pickFallback: 定型お題へのフォールバック", () => {
  it("FALLBACK_PROBLEMS は空でない", () => {
    expect(FALLBACK_PROBLEMS.length).toBeGreaterThan(0);
  });

  it("定型お題を返し、source が 'fallback' である", () => {
    const result = pickFallback("TypeScript", "easy");
    expect(result.source).toBe("fallback");
    expect(result.problem).toBeTruthy();
  });

  it("返された定型お題は有効なお題構造を持つ", () => {
    const { problem } = pickFallback("TypeScript", "easy");
    expect(problem.title).toBeTruthy();
    expect(problem.description).toBeTruthy();
    expect(Array.isArray(problem.requirements)).toBe(true);
    expect(problem.exampleTest).toBeTruthy();
    expect(Array.isArray(problem.hints)).toBe(true);
  });

  it("AI生成失敗時に定型を返す（FR-024）", () => {
    // AI生成の結果として不正な JSON が来た場合
    const invalidAiResult = "{ broken json";
    const validation = validateProblem(invalidAiResult as never);
    expect(validation.isErr()).toBe(true);

    // フォールバックを使う
    const fallback = pickFallback("TypeScript", "easy");
    expect(fallback.source).toBe("fallback");
  });
});

describe("FALLBACK_PROBLEMS: 定型お題バンク", () => {
  it("各お題は必須フィールドを持つ", () => {
    for (const p of FALLBACK_PROBLEMS) {
      expect(p.problem.title).toBeTruthy();
      expect(p.problem.description).toBeTruthy();
      expect(Array.isArray(p.problem.requirements)).toBe(true);
      expect(p.problem.exampleTest).toBeTruthy();
    }
  });
});
