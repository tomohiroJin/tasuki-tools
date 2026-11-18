import { describe, expect, it } from "vitest";
import {
  CATEGORIES, DIFFICULTIES, LANGUAGES, pickTopicFallback,
  type Category, type Difficulty, type Language,
} from "../src/index.js";
import { TOPIC_BANK } from "../src/topic-bank.js";

// 定型バンクの健全性（件数・上限・本文の形）は `tests/topic-bank.test.ts` にある（#634 で移した）。

const entryOf = (title: string) => TOPIC_BANK.find((e) => e.title === title);
const seedsUpTo = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * @requirements #91 E7・#634（種類を選んだとき、その種類の定型だけから選ぶ）
 */
describe("pickTopicFallback", () => {
  it("選ばれた難易度のお題を source: fallback で返す", () => {
    const t = pickTopicFallback("Go", "hard", "tdd", 0, null);
    expect(entryOf(t.title)?.difficulty).toBe("hard");
    expect(t.source).toBe("fallback");
  });

  for (const category of CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      it(`Given 種類 ${category}・難易度 ${difficulty} / When 種を候補の数だけ振る / Then その組の定型だけを、すべて返す`, () => {
        // Given: その組の定型
        const pool = TOPIC_BANK.filter((e) => e.category === category && e.difficulty === difficulty);
        // When
        const got = seedsUpTo(pool.length).map((now) => pickTopicFallback("Python", difficulty, category, now, null).title);
        // Then: 組の外が混ざらず、組の全件が出そろう（絞り込みが効き、候補を取りこぼさない）
        expect(got.map((title) => [entryOf(title)?.category, entryOf(title)?.difficulty])).toEqual(
          got.map(() => [category, difficulty]),
        );
        expect(new Set(got).size).toBe(pool.length);
      });
    }
  }

  it("直前と同じお題を返さない（どの種類・難易度・種でも）", () => {
    for (const category of CATEGORIES) {
      for (const difficulty of DIFFICULTIES) {
        for (let now = 0; now < 50; now++) {
          const first = pickTopicFallback("Python", difficulty, category, now, null);
          const second = pickTopicFallback("Python", difficulty, category, now, first);
          expect({ category, difficulty, now, same: second.title === first.title }).toEqual({
            category, difficulty, now, same: false,
          });
        }
      }
    }
  });

  it("Given 境界を通り抜けて許可リストに無い種類 / When 選ぶ / Then 種類で絞らず、今までどおり難易度で絞った全種類から選ぶ", () => {
    // Given: 種類を問わない、その難易度の定型
    const pool = TOPIC_BANK.filter((e) => e.difficulty === "medium");
    // When
    const got = seedsUpTo(pool.length).map(
      (now) => pickTopicFallback("Go", "medium", "poetry" as unknown as Category, now, null).title,
    );
    // Then: 難易度は守られ、種類は 1 つに絞られていない（全件が並び順どおりに出る）
    expect(got).toEqual(pool.map((e) => e.title));
    expect(new Set(got.map((t) => entryOf(t)?.category)).size).toBeGreaterThan(1);
  });

  it("Given 境界を通り抜けて許可リストに無い難易度 / When 選ぶ / Then 空のプールで落ちずに、全件から返す（必ず 1 件返す）", () => {
    const got = seedsUpTo(TOPIC_BANK.length).map(
      (now) => pickTopicFallback("Go", "expert" as unknown as Difficulty, "tdd", now, null).title,
    );
    expect(got).toEqual(TOPIC_BANK.map((e) => e.title));
  });

  it("境界を通り抜けて許可リストに無い言語が渡っても、種類・難易度で絞らず全件から返す", () => {
    // 難易度を "easy" に固定して now を 0..全件-1 で振る。プールが全件ならちょうど全件のタイトルが出そろい、
    // "easy" 以外の難易度も、tdd 以外の種類も混ざる。誤って絞ったままだと出そろわない —— その違いで区別する。
    const seen = new Set<string>();
    for (let now = 0; now < TOPIC_BANK.length; now++) {
      const t = pickTopicFallback("COBOL" as unknown as Language, "easy", "tdd", now, null);
      expect(t.source).toBe("fallback");
      seen.add(t.title);
    }
    expect(seen.size).toBe(TOPIC_BANK.length);
    const got = [...seen].map(entryOf);
    expect(new Set(got.map((e) => e?.difficulty))).toEqual(new Set(DIFFICULTIES));
    expect(new Set(got.map((e) => e?.category))).toEqual(new Set(CATEGORIES));
  });
});

/**
 * 定型のお題の選び方の特性テスト（#365 Task 1。#634 で種類の次元を足した）。
 *
 * 定型バンクの `languages` の欄を外す前に、選び方の結果を**並びまで**固定した。
 * 期待値は欄を外す前の実装で得た並びを直書きしたもの（定型バンクの並びと、種の剰余で決まる）。
 * #634 で TDD のお題を末尾へ足したので、直書きの並びは **TDD の候補の先頭**として固定する
 * （旧い 33 件の並びが崩れていないこと）。足した分の並びはバンクの並びと同じであることを見る。
 *
 * - 許可リストの言語では、どの言語でも同じ並びになる（言語の絞り込みが何も除いていない）
 * - 許可リストに無い言語では、種類・難易度で絞らずに全件から選ぶ
 * - 直前のお題は候補から除く
 */
describe("pickTopicFallback の選び方の特性（#365・#634）", () => {
  const titles = (language: string, difficulty: Difficulty, seeds: readonly number[], previous: string | null) =>
    seeds.map(
      (now) =>
        pickTopicFallback(
          language as Language,
          difficulty,
          "tdd",
          now,
          previous === null ? null : { title: previous, body: "", source: "fallback" },
        ).title,
    );
  const tddPool = (difficulty: Difficulty) =>
    TOPIC_BANK.filter((e) => e.category === "tdd" && e.difficulty === difficulty).map((e) => e.title);

  /** 旧い 33 件（#365 の時点の並び）。TDD の候補の先頭に、この並びのまま居る */
  const BY_DIFFICULTY: Record<Difficulty, readonly string[]> = {
    easy: [
      "FizzBuzz",
      "回文チェッカー",
      "銀行口座",
      "二数の和",
      "文字数カウント",
      "最大値を探す",
      "温度変換",
      "母音カウント",
      "配列の合計と平均",
      "重複の除去",
      "アナグラム判定",
      "うるう年判定",
    ],
    medium: [
      "ローマ数字変換",
      "テニスゲームスコア",
      "数値のカンマ区切り",
      "括弧の対応チェック",
      "ランレングス圧縮",
      "シーザー暗号",
      "二分探索",
      "2 数の和（Two Sum）",
      "連結リストの反転",
      "区間のマージ",
      "逆ポーランド記法電卓",
      "ショッピングカート合計",
      "パスワード強度チェック",
      "電話番号フォーマット",
    ],
    hard: [
      "行列の回転",
      "ボウリングのスコア計算",
      "LRU キャッシュ",
      "三目並べの勝敗判定",
      "ネストJSONの平坦化",
      "レート制限（トークンバケット）",
      "電卓（式の評価）",
    ],
  };

  for (const difficulty of DIFFICULTIES) {
    it(`Given 許可リストのどの言語でも / When tdd の ${difficulty} を種 0.. で選ぶ / Then 同じ並びになり、先頭は旧い並びのまま`, () => {
      // Given
      const expected = tddPool(difficulty);
      for (const language of LANGUAGES) {
        // When
        const got = titles(language, difficulty, seedsUpTo(expected.length), null);
        // Then
        expect({ language, got }).toEqual({ language, got: expected });
      }
      expect(expected.slice(0, BY_DIFFICULTY[difficulty].length)).toEqual(BY_DIFFICULTY[difficulty]);
    });
  }

  it("Given 種が候補の数を超える・負 / When 選ぶ / Then 剰余（負は絶対値）で同じ並びをたどる", () => {
    // Given
    const easy = tddPool("easy");
    // When
    const got = titles("Python", "easy", [easy.length, easy.length + 1, -1, -2], null);
    // Then
    expect(got).toEqual([easy[0], easy[1], easy[1], easy[2]]);
  });

  for (const difficulty of DIFFICULTIES) {
    it(`Given 直前のお題 / When tdd の ${difficulty} を種 0.. で選ぶ / Then 直前を除いた並びになる`, () => {
      // Given: 直前は旧い並びの先頭
      const previous = BY_DIFFICULTY[difficulty][0]!;
      const expected = tddPool(difficulty).filter((t) => t !== previous);
      // When
      const got = titles("Go", difficulty, seedsUpTo(expected.length), previous);
      // Then
      expect(got).toEqual(expected);
      expect(got.slice(0, BY_DIFFICULTY[difficulty].length - 1)).toEqual(BY_DIFFICULTY[difficulty].slice(1));
    });
  }

  it("Given 許可リストに無い言語 / When easy を種 0.. で選ぶ / Then 種類・難易度で絞らず全件の並びになり、先頭は旧い 33 件の並び", () => {
    // Given
    const OLD_33 = [
      "FizzBuzz",
      "回文チェッカー",
      "ローマ数字変換",
      "銀行口座",
      "テニスゲームスコア",
      "行列の回転",
      "二数の和",
      "文字数カウント",
      "最大値を探す",
      "温度変換",
      "母音カウント",
      "配列の合計と平均",
      "重複の除去",
      "アナグラム判定",
      "うるう年判定",
      "数値のカンマ区切り",
      "括弧の対応チェック",
      "ランレングス圧縮",
      "シーザー暗号",
      "二分探索",
      "2 数の和（Two Sum）",
      "連結リストの反転",
      "区間のマージ",
      "逆ポーランド記法電卓",
      "ショッピングカート合計",
      "パスワード強度チェック",
      "電話番号フォーマット",
      "ボウリングのスコア計算",
      "LRU キャッシュ",
      "三目並べの勝敗判定",
      "ネストJSONの平坦化",
      "レート制限（トークンバケット）",
      "電卓（式の評価）",
    ];
    // When
    const got = titles("COBOL", "easy", seedsUpTo(TOPIC_BANK.length), null);
    // Then
    expect(got).toEqual(TOPIC_BANK.map((e) => e.title));
    expect(got.slice(0, OLD_33.length)).toEqual(OLD_33);
  });
});
