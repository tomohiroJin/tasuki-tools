/**
 * お題バリデーション・プロンプト生成
 * T023: FR-021, FR-022, FR-023, FR-024
 */

import { ok, err, type Result } from "neverthrow";
import * as v from "valibot";
import { ProblemSchema } from "./schemas.js";
import type { Problem, ProblemSource } from "./aggregate.js";
import { FALLBACK_PROBLEMS } from "./problem-bank.js";
export { FALLBACK_PROBLEMS };

/** ソース付きお題 */
export interface ProblemWithSource {
  problem: Problem;
  source: ProblemSource;
}

/** 定型お題エントリ */
export interface FallbackProblemEntry {
  problem: Problem;
  languages: string[];
  difficulty: string;
}

// ─── 検証 ────────────────────────────────────────────────────────────────────

/**
 * お題オブジェクトを Valibot で検証する
 * AI 由来のテキストを信頼しないデータとして扱う（FR-023）
 */
export function validateProblem(
  raw: unknown,
): Result<Problem, v.ValiError<typeof ProblemSchema>> {
  const result = v.safeParse(ProblemSchema, raw);
  if (result.success) {
    return ok(result.output);
  }
  return err(result.issues as never);
}

// ─── フォールバック ──────────────────────────────────────────────────────────

/**
 * 言語・難易度に合った定型お題を返す
 * AI 生成失敗時のフォールバック（FR-024）
 */
export function pickFallback(
  language: string,
  difficulty: string,
): ProblemWithSource {
  // 言語・難易度でフィルタ
  let candidates = FALLBACK_PROBLEMS.filter(
    (e) => e.languages.includes(language) && e.difficulty === difficulty,
  );

  // 言語フィルタのみ
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS.filter((e) =>
      e.languages.includes(language),
    );
  }

  // 全フォールバック
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS;
  }

  // 疑似ランダムに選択（時刻ベース）
  const index = Math.abs(Date.now()) % candidates.length;
  const entry = candidates[index] ?? FALLBACK_PROBLEMS[0]!;

  return { problem: entry.problem, source: "fallback" };
}

// ─── AI プロンプト生成 ───────────────────────────────────────────────────────

/**
 * AI お題生成用のプロンプトを生成する
 * FR-021, FR-022
 */
export function buildProblemPrompt(language: string, difficulty: string): string {
  return `You are a TDD coding kata generator. Generate a programming kata in ${language} at ${difficulty} difficulty.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "短いお題名（日本語・3〜10語相当）",
  "description": "実装内容の明確な説明（日本語・1〜2文）",
  "requirements": ["要件1（日本語）", "要件2（日本語）", "要件3（日本語）", "要件4（日本語）"],
  "exampleTest": "example test code in ${language} syntax (code only)",
  "hints": ["ヒント1（日本語）", "ヒント2（日本語）"]
}

Rules:
- Write title, description, requirements, and hints in NATURAL, CLEAR JAPANESE (日本語).
- The exampleTest MUST be valid ${language} code with ENGLISH identifiers (function and variable names in English). Code comments may be in Japanese. Do NOT translate code identifiers.
- The kata must be suitable for TDD practice (test-first approach)
- Include 4-6 clear, testable requirements. Each requirement must be verifiable by a test (avoid vague or ambiguous phrasing).
- The exampleTest MUST be valid ${language} syntax and show at least one concrete input/output assertion.
- Difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)
- Make it practical and educational; avoid trivial one-liners`;
}
