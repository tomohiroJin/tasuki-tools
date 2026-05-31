/**
 * お題バンク・バリデーション・プロンプト生成
 * T023: FR-021, FR-022, FR-023, FR-024
 */

import { ok, err, type Result } from "neverthrow";
import * as v from "valibot";
import { ProblemSchema } from "./schemas.js";
import type { Problem, ProblemSource } from "./aggregate.js";

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

// ─── 定型お題バンク ──────────────────────────────────────────────────────────

export const FALLBACK_PROBLEMS: FallbackProblemEntry[] = [
  {
    problem: {
      title: "FizzBuzz",
      description:
        "1 から N までの整数を順に出力する。3の倍数は 'Fizz'、5の倍数は 'Buzz'、両方の倍数は 'FizzBuzz' を出力する。",
      requirements: [
        "1 から N までループする",
        "3の倍数のとき 'Fizz' を返す",
        "5の倍数のとき 'Buzz' を返す",
        "15の倍数のとき 'FizzBuzz' を返す",
        "それ以外はその数値を文字列で返す",
      ],
      exampleTest: `test('FizzBuzz(15) は FizzBuzz', () => {
  expect(fizzBuzz(15)).toBe('FizzBuzz');
});`,
      hints: ["15の倍数を先にチェックする", "% 演算子を使う"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "easy",
  },
  {
    problem: {
      title: "回文チェッカー",
      description:
        "与えられた文字列が回文（前から読んでも後ろから読んでも同じ）かどうかを判定する。大文字小文字は区別しない。英数字のみ考慮する。",
      requirements: [
        "英数字以外の文字は無視する",
        "大文字小文字を区別しない",
        "空文字列は回文とする",
        "単一文字は回文とする",
      ],
      exampleTest: `test('"A man, a plan, a canal: Panama" は回文', () => {
  expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);
});`,
      hints: ["正規表現でフィルタリング", "reverse() と比較"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "easy",
  },
  {
    problem: {
      title: "ローマ数字変換",
      description:
        "整数（1〜3999）をローマ数字表記に変換する。",
      requirements: [
        "1〜3999 の範囲を処理する",
        "I, V, X, L, C, D, M の 7 種類を使う",
        "減算則（IV = 4, IX = 9, XL = 40, XC = 90, CD = 400, CM = 900）に対応する",
      ],
      exampleTest: `test('4 は IV', () => {
  expect(toRoman(4)).toBe('IV');
});
test('1994 は MCMXCIV', () => {
  expect(toRoman(1994)).toBe('MCMXCIV');
});`,
      hints: ["対応表を配列で持つ", "大きい値から順に引いていく"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "medium",
  },
  {
    problem: {
      title: "銀行口座",
      description:
        "入金・出金・残高照会ができる銀行口座クラスを実装する。",
      requirements: [
        "入金は正の金額のみ許可する",
        "出金は残高を超えてはいけない",
        "取引履歴を管理する",
        "残高照会が正しい値を返す",
      ],
      exampleTest: `test('入金後の残高が正しい', () => {
  const account = new BankAccount();
  account.deposit(100);
  expect(account.balance).toBe(100);
});`,
      hints: ["不変式（残高 >= 0）を守る", "エラーは例外で表現"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "easy",
  },
  {
    problem: {
      title: "テニスゲームスコア",
      description:
        "テニスのゲーム内スコアを計算する。0→Love, 1→15, 2→30, 3→40, デュース、アドバンテージに対応する。",
      requirements: [
        "0〜3 点を Love/15/30/40 で表示",
        "両者 40 点はデュース",
        "デュース後のリードはアドバンテージ",
        "アドバンテージから得点でゲーム終了",
      ],
      exampleTest: `test('0-0 は Love-All', () => {
  expect(score(0, 0)).toBe('Love-All');
});
test('3-3 はDeuce', () => {
  expect(score(3, 3)).toBe('Deuce');
});`,
      hints: ["状態で場合分け", "対称性を活用"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "medium",
  },
  {
    problem: {
      title: "行列の回転",
      description:
        "N×N の整数行列を時計回りに 90 度回転させる。",
      requirements: [
        "正方行列（N×N）を処理する",
        "時計回りに 90 度回転する",
        "元の行列を変更しない（新しい行列を返す）",
      ],
      exampleTest: `test('2×2行列の回転', () => {
  const m = [[1, 2], [3, 4]];
  expect(rotate(m)).toEqual([[3, 1], [4, 2]]);
});`,
      hints: ["行列転置 + 行反転", "または直接インデックス計算"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "hard",
  },
];

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
  "title": "short kata name (3-10 words)",
  "description": "clear description of what to implement (1-2 sentences)",
  "requirements": ["requirement 1", "requirement 2", "requirement 3", "requirement 4"],
  "exampleTest": "example test code showing expected behavior in ${language} syntax",
  "hints": ["hint 1", "hint 2"]
}

Rules:
- The kata must be suitable for TDD practice (test-first approach)
- Include 4-6 clear, testable requirements. Each requirement must be verifiable by a test (avoid vague or ambiguous phrasing).
- The exampleTest MUST be valid ${language} syntax and show at least one concrete input/output assertion.
- Difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)
- Make it practical and educational; avoid trivial one-liners`;
}
