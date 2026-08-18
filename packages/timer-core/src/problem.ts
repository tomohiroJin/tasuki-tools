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
 *
 * @param now 選択の元になる値。**実体は擬似乱数の種であり、時刻としての意味は持たない。**
 *   引数名を `now` にしているのは `docs/timer/adr/0002`（「時刻は引数 `now` として注入し、
 *   `Date.now()` をドメイン内で呼ばない」）と timer-core の他所（`records.ts` `evolve.ts`
 *   `aggregate.ts`）の語彙に揃えるため。**既定値は置かない** — 既定値があると呼び出し側が
 *   無変更で通り、「配線されている」ことが検査されないまま緑になる（#166 / #72 E3）。
 */
export function pickFallback(
  language: string,
  difficulty: string,
  now: number,
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

  // 疑似ランダムに選択（呼び出し側が渡した値ベース）
  const index = Math.abs(now) % candidates.length;
  // `?? FALLBACK_PROBLEMS[0]!` は置かない。有効な now では candidates[index] が必ず
  // 定義済みなので死んだ枝であり、置くと now の渡し忘れ（NaN）を黙って飲み込んで
  // 先頭のお題を返してしまう。テストは型検査の射程外なので、これが唯一の防波堤になる。
  const entry = candidates[index]!;

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
