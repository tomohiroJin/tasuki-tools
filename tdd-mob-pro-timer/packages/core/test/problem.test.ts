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

  /**
   * @requirements FR-023
   */
  it("不正な JSON 文字列は Err を返す（AI 由来のテキストを信頼しない）", () => {
    const result = validateProblem("invalid json" as never);
    expect(result.isErr()).toBe(true);
  });

  // ─── coverage-supplement.test.ts より移動（T036） ─────────────────────────

  it("title が数値など不正な型なら Err を返す", () => {
    expect(validateProblem({ title: 123 }).isErr()).toBe(true);
  });

  it("必須フィールドを満たす構造は Ok を返す", () => {
    const ok = validateProblem({ title: "T", description: "d", requirements: ["r"], exampleTest: "t", hints: [] });
    expect(ok.isOk()).toBe(true);
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

  // coverage-supplement.test.ts より移動（T036）
  it("該当言語が無くてもフォールバックお題を返す（全フォールバックへ縮退）", () => {
    // When
    const result = pickFallback("COBOL-不明言語", "easy");
    // Then
    expect(result.source).toBe("fallback");
    expect(result.problem.title.length).toBeGreaterThan(0);
    expect(Array.isArray(result.problem.requirements)).toBe(true);
  });

  /**
   * @requirements FR-024
   */
  it("AI生成失敗時に定型を返す", () => {
    // Given（AI生成の結果として不正な JSON が来た場合）
    const invalidAiResult = "{ broken json";
    const validation = validateProblem(invalidAiResult as never);
    expect(validation.isErr()).toBe(true);
    // When（フォールバックを使う）
    const fallback = pickFallback("TypeScript", "easy");
    // Then
    expect(fallback.source).toBe("fallback");
  });
});

describe("FALLBACK_PROBLEMS: 定型お題バンク", () => {
  it("各お題は必須フィールドを持つ", () => {
    // When / Then
    for (const p of FALLBACK_PROBLEMS) {
      expect(p.problem.title).toBeTruthy();
      expect(p.problem.description).toBeTruthy();
      expect(Array.isArray(p.problem.requirements)).toBe(true);
      expect(p.problem.exampleTest).toBeTruthy();
    }
  });
});

// ─── T021: buildProblemPrompt の要件下限テスト ────────────────────────────────

import { buildProblemPrompt } from "../src/problem.js";

/**
 * @requirements T021
 */
describe("buildProblemPrompt", () => {
  it("言語と難易度がプロンプトに含まれる", () => {
    const prompt = buildProblemPrompt("TypeScript", "easy");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("easy");
  });

  it("4件以上の要件を促す指示を含む", () => {
    const prompt = buildProblemPrompt("Python", "medium");
    // 「4〜6件」または「4-6 requirements」等の数値指示が含まれること
    expect(prompt).toMatch(/[4-6].*requirement|requirement.*[4-6]/i);
  });

  it("例示テストの必須化を指示する文言を含む", () => {
    const prompt = buildProblemPrompt("Go", "hard");
    expect(prompt.toLowerCase()).toMatch(/example.*test|test.*example/i);
  });

  it("JSON フォーマットの返却を指示する文言を含む", () => {
    const prompt = buildProblemPrompt("TypeScript", "easy");
    expect(prompt).toContain("JSON");
    // requirements フィールドがスキーマに含まれること
    expect(prompt).toContain("requirements");
  });
});

describe("FALLBACK_PROBLEMS バンク（AI なしの唯一の出題源）", () => {
  it("30 件以上ある", () => {
    expect(FALLBACK_PROBLEMS.length).toBeGreaterThanOrEqual(30);
  });

  it("全エントリがスキーマ検証を通る具体的なお題である", () => {
    // When / Then（具体性: 説明は十分な長さ、要件は2件以上、テスト例あり）
    for (const entry of FALLBACK_PROBLEMS) {
      const result = validateProblem(entry.problem);
      result._unsafeUnwrap();
      expect(entry.problem.description.length).toBeGreaterThanOrEqual(15);
      expect(entry.problem.requirements.length).toBeGreaterThanOrEqual(2);
      expect(entry.problem.exampleTest.length).toBeGreaterThan(0);
      expect(entry.languages.length).toBeGreaterThan(0);
    }
  });

  it("難易度が easy/medium/hard に分散している", () => {
    // Given
    const diffs = new Set(FALLBACK_PROBLEMS.map((e) => e.difficulty));
    // Then
    expect(diffs.has("easy")).toBe(true);
    expect(diffs.has("medium")).toBe(true);
    expect(diffs.has("hard")).toBe(true);
  });

  it("タイトルが重複していない", () => {
    const titles = FALLBACK_PROBLEMS.map((e) => e.problem.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

// ─── buildProblemPrompt 日本語化テスト ────────────────────────────────────────

describe("buildProblemPrompt 日本語化", () => {
  it("説明文を日本語で書く指示を含む", () => {
    const p = buildProblemPrompt("TypeScript", "easy");
    expect(p).toContain("JAPANESE");
    expect(p).toContain("日本語");
  });

  it("exampleTest は英語識別子のコードと明示する", () => {
    const p = buildProblemPrompt("Python", "medium");
    expect(p).toContain("ENGLISH identifiers");
  });

  it("言語と難易度を埋め込む", () => {
    const p = buildProblemPrompt("Go", "hard");
    expect(p).toContain("Go");
    expect(p).toContain("hard");
  });
});
