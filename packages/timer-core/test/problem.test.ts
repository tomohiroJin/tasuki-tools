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
import type { Problem } from "../src/aggregate.js";

describe("validateProblem: Valibot検証", () => {
  it("正常なお題は Ok を返す", () => {
    // Given
    const problem = {
      title: "FizzBuzz",
      description: "実装してください",
      requirements: ["3の倍数はFizz"],
      exampleTest: "expect(fizzBuzz(3)).toBe('Fizz')",
      hints: [],
    };
    // When
    const result = validateProblem(problem);
    // Then
    expect(result.isOk()).toBe(true);
  });

  it("title が空の場合は Err を返す", () => {
    // Given
    const problem = {
      title: "",
      description: "desc",
      requirements: [],
      exampleTest: "test",
      hints: [],
    };
    // When
    const result = validateProblem(problem);
    // Then
    expect(result.isErr()).toBe(true);
  });

  it("description が欠けている場合は Err を返す", () => {
    // Given
    const problem = {
      title: "test",
      description: "",
      requirements: [],
      exampleTest: "test",
      hints: [],
    };
    // When
    const result = validateProblem(problem);
    // Then
    expect(result.isErr()).toBe(true);
  });

  it("exampleTest が欠けている場合は Err を返す", () => {
    // Given
    const problem = {
      title: "test",
      description: "desc",
      requirements: [],
      exampleTest: "",
      hints: [],
    };
    // When
    const result = validateProblem(problem);
    // Then
    expect(result.isErr()).toBe(true);
  });

  it("requirements が配列でない場合は Err を返す", () => {
    // Given
    const problem = {
      title: "test",
      description: "desc",
      requirements: "not an array" as never,
      exampleTest: "test",
      hints: [],
    };
    // When
    const result = validateProblem(problem);
    // Then
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
    // Given
    const language = "TypeScript";
    const difficulty = "easy";
    // When
    const result = pickFallback(language, difficulty, 0, null);
    // Then
    expect(result.source).toBe("fallback");
    expect(result.problem).toBeTruthy();
  });

  it("返された定型お題は有効なお題構造を持つ", () => {
    // Given
    const language = "TypeScript";
    const difficulty = "easy";
    // When
    const { problem } = pickFallback(language, difficulty, 0, null);
    // Then
    expect(problem.title).toBeTruthy();
    expect(problem.description).toBeTruthy();
    expect(Array.isArray(problem.requirements)).toBe(true);
    expect(problem.exampleTest).toBeTruthy();
    expect(Array.isArray(problem.hints)).toBe(true);
  });

  // coverage-supplement.test.ts より移動（T036）
  it("該当言語が無くてもフォールバックお題を返す（全フォールバックへ縮退）", () => {
    // Given
    const unknownLanguage = "COBOL-不明言語";
    // When
    const result = pickFallback(unknownLanguage, "easy", 0, null);
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
    const fallback = pickFallback("TypeScript", "easy", 0, null);
    // Then
    expect(fallback.source).toBe("fallback");
  });

  /**
   * 第 3 引数が実際に選択を決めていることを固定する（#166 / #72 E3）。
   *
   * **この 3 件が無いと、第 3 引数を完全に無視する実装でも全件緑になる。**
   * 既存のテストは source と必須フィールドしか見ておらず、どのお題が選ばれたかを
   * 観測していないため。
   */
  it("同じ now を渡せば同じお題を返す", () => {
    // Given
    const now = 12345;
    // When
    const a = pickFallback("TypeScript", "easy", now, null);
    const b = pickFallback("TypeScript", "easy", now, null);
    // Then
    expect(a.problem.title).toBe(b.problem.title);
  });

  it("now を 0 から順に動かすと定型バンクを一巡する（引数が index を決めている証拠）", () => {
    // Given（未知言語を渡して全件縮退させ、母数を FALLBACK_PROBLEMS.length に確定させる）
    const unknownLanguage = "COBOL-不明言語";
    // When
    const titles = Array.from({ length: FALLBACK_PROBLEMS.length }, (_, now) =>
      pickFallback(unknownLanguage, "easy", now, null).problem.title,
    );
    // Then（重複が無い＝全件を 1 度ずつ選んでいる）
    expect(new Set(titles).size).toBe(FALLBACK_PROBLEMS.length);
  });

  it("負の now でも範囲内のお題を返す（Math.abs の既存挙動）", () => {
    // Given
    const negativeNow = -7;
    // When
    const result = pickFallback("COBOL-不明言語", "easy", negativeNow, null);
    // Then
    expect(FALLBACK_PROBLEMS.some((e) => e.problem.title === result.problem.title)).toBe(true);
  });
});

describe("FALLBACK_PROBLEMS: 定型お題バンク", () => {
  it("各お題は必須フィールドを持つ", () => {
    // Given（FALLBACK_PROBLEMS 全件を対象にする）
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
    // Given
    const language = "TypeScript";
    const difficulty = "easy";
    // When
    const prompt = buildProblemPrompt(language, difficulty);
    // Then
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
    // Given
    const language = "TypeScript";
    const difficulty = "easy";
    // When
    const prompt = buildProblemPrompt(language, difficulty);
    // Then
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
    // Given（FALLBACK_PROBLEMS 全件を対象にする）
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
    // Given（FALLBACK_PROBLEMS 全件を対象にする）
    // When
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
    // Given
    const language = "TypeScript";
    const difficulty = "easy";
    // When
    const p = buildProblemPrompt(language, difficulty);
    // Then
    expect(p).toContain("JAPANESE");
    expect(p).toContain("日本語");
  });

  it("exampleTest は英語識別子のコードと明示する", () => {
    const p = buildProblemPrompt("Python", "medium");
    expect(p).toContain("ENGLISH identifiers");
  });

  it("言語と難易度を埋め込む", () => {
    // Given
    const language = "Go";
    const difficulty = "hard";
    // When
    const p = buildProblemPrompt(language, difficulty);
    // Then
    expect(p).toContain("Go");
    expect(p).toContain("hard");
  });
});

/**
 * 直前のお題を候補から外す（#283 のレビュー）。
 *
 * **なぜ要るか。** 「別のお題にする」を押したことが画面に出る保証が、ここにしか無い。
 * 生成中の表示はサーバーが依頼の冒頭に 1 本配信しているが、AI を使わない既定のルームでは
 * 依頼と確定が同じ tick で終わるため、**送信元の端末では 2 本が 1 回の描画に畳まれて
 * 生成中が一度も現れない**（実ブラウザで押した本人は 10 回中 0 回、押していない側は
 * 7 回／`aria-busy` が真の時間は 8〜11ms）。結果が必ず変わることが唯一の手応えになる。
 *
 * @requirements #283
 */
describe("pickFallback: 直前のお題を外す", () => {
  /** バンクに載っている言語（全項目が同じ一覧を持つので先頭から採る）。 */
  const LANGUAGES = FALLBACK_PROBLEMS[0]!.languages;
  const DIFFICULTIES = ["easy", "medium", "hard"] as const;
  /** 候補の並びの端まで当たるように、候補数より多い剰余を歩かせる。 */
  const NOWS = [0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 1_755_500_000_000, -7];

  /** そのお題をいま載せている、という前提を作る（出所は確定時に付く形に合わせる）。 */
  function asPrevious(title: string): Problem {
    const entry = FALLBACK_PROBLEMS.find((e) => e.problem.title === title);
    if (!entry) throw new Error(`前提: 定型バンクに「${title}」が無い`);
    return { ...entry.problem, source: "fallback" };
  }

  it("どの言語・難易度・どの直前のお題でも、直前と同じお題は返らない", () => {
    // Given: バンクが作りうる (言語 × 難易度 × 直前) の全組み合わせ
    const offenders: string[] = [];
    for (const language of LANGUAGES) {
      for (const difficulty of DIFFICULTIES) {
        for (const entry of FALLBACK_PROBLEMS) {
          const previous = asPrevious(entry.problem.title);
          for (const now of NOWS) {
            // When
            const got = pickFallback(language, difficulty, now, previous).problem.title;
            // Then（違反を集めてから一度に報告する。1 件目で止めると全体像が見えない）
            if (got === previous.title) {
              offenders.push(`${language}/${difficulty}/now=${now} → ${got}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * **契約「必ず 1 件返す」**（候補が 1 件しかない場合の番人）。
   *
   * 除いた結果が空になったら元の候補集合へ戻す、という枝がこれを守っている。
   * ⚠ **現在の定型バンクではその枝は通らない** —— 全項目が全言語を載せているので、
   * 最も狭い組（`hard`）でも候補は 7 件ある（`grep -c 'difficulty: "hard"'` で 7）。
   * **バンクが痩せて候補が 1 件になった瞬間に、この検査が最初に赤くなる**
   * （番人が無ければ `undefined` を返して落ちる）。
   */
  it("どの組み合わせでも、必ず有効な定型お題が 1 件返る", () => {
    const titles = new Set(FALLBACK_PROBLEMS.map((e) => e.problem.title));
    for (const language of [...LANGUAGES, "COBOL-不明言語"]) {
      for (const difficulty of [...DIFFICULTIES, "不明難易度"]) {
        for (const entry of FALLBACK_PROBLEMS) {
          const result = pickFallback(
            language,
            difficulty,
            0,
            { ...entry.problem, source: "fallback" },
          );
          expect(result.source).toBe("fallback");
          expect(titles.has(result.problem.title)).toBe(true);
        }
      }
    }
  });

  it("直前のお題が候補に無ければ、何も外れない（null を渡したときと同じ結果）", () => {
    // Given: `hard` の候補に入っていない `easy` のお題を直前として渡す
    const easyOnly = FALLBACK_PROBLEMS.find((e) => e.difficulty === "easy")!;
    const previous: Problem = { ...easyOnly.problem, source: "fallback" };
    for (const now of NOWS) {
      // When / Then
      expect(pickFallback("TypeScript", "hard", now, previous).problem.title).toBe(
        pickFallback("TypeScript", "hard", now, null).problem.title,
      );
    }
  });

  it("タイトルごと書き換えられたお題は、何も外さない", () => {
    // Given: 利用者が貼り付けた／タイトルを編集したお題（バンクのどれとも一致しない）
    const pasted: Problem = {
      title: "自分で持ち込んだお題",
      description: "説明",
      requirements: [],
      exampleTest: "t()",
      hints: [],
      source: "custom",
    };
    for (const now of NOWS) {
      // When / Then: 画面に出ているのは利用者が作った別物なので、
      // バンクのどれが返っても「変わった」ことは分かる
      expect(pickFallback("TypeScript", "easy", now, pasted).problem.title).toBe(
        pickFallback("TypeScript", "easy", now, null).problem.title,
      );
    }
  });

  it("説明だけを編集してタイトルが残っているお題は、外す", () => {
    // Given: 中身は違うがタイトルは同じ（画面の見出しは変わらない）
    const base = pickFallback("TypeScript", "easy", 0, null).problem;
    const edited: Problem = { ...base, description: "自分で書き換えた説明", edited: true };
    // When / Then: 同じタイトルが返ると「何も起きていない」ように見える
    for (const now of NOWS) {
      expect(pickFallback("TypeScript", "easy", now, edited).problem.title).not.toBe(base.title);
    }
  });
});
