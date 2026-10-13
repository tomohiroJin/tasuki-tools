import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE, TOPIC_BANK, pickTopicFallback,
  type Difficulty, type Language,
} from "../src/index.js";

/**
 * @requirements #91(定型バンクの健全性。spec §10)
 */
describe("定型バンク", () => {
  it("33 件すべてが上限に収まり、空白だけのタイトルが無い", () => {
    expect(TOPIC_BANK).toHaveLength(33);
    for (const e of TOPIC_BANK) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.title.length).toBeLessThanOrEqual(MAX_TOPIC_TITLE);
      expect(e.body.length).toBeLessThanOrEqual(MAX_TOPIC_BODY);
    }
  });

  /**
   * `topic-core` は依存を持たない（`scripts/audit-dependency-direction.mjs` の許可表が空）ので、
   * `@tasuki/markdown` の解析には通さず、本文の文字列で囲みの開きと閉じを見る。
   * 閉じが「ヒント:」より前にあることまで見る —— 開きだけを見ると、閉じ忘れで
   * 以降の本文が全部コードになる誤りを通してしまう。
   */
  it("すべての本文で、最初のテストの例がコードの囲みの中にあり、ヒントより前で閉じる", () => {
    const OPEN = "最初のテストの例:\n```\n";
    for (const e of TOPIC_BANK) {
      // Given: 本文の中の、最初のテストの例の開き
      const at = e.body.indexOf(OPEN);
      // When: 開きの後ろで、囲みの閉じとヒントを探す
      const close = at < 0 ? -1 : e.body.indexOf("\n```", at + OPEN.length);
      const hint = e.body.indexOf("ヒント:");
      // Then: 開きがあり、テストのコードを挟んでヒントより前で閉じている。
      // 閉じが見つからないと indexOf は -1 を返し「ヒントより前」を素通りするので、閉じの在否を先に見る
      expect({ title: e.title, opened: at >= 0, closed: close >= 0 }).toEqual({
        title: e.title,
        opened: true,
        closed: true,
      });
      expect(e.body.slice(at + OPEN.length, close)).toMatch(/^test\(/);
      expect(close).toBeLessThan(hint < 0 ? e.body.length : hint);
    }
  });

  // #365 で言語の欄を外したので、言語の次元は無い（どのお題も全ての言語に当てはまる）。見ている性質は同じ。
  it("どの難易度でも候補が 2 件以上ある（直前を外しても空にならない）", () => {
    for (const difficulty of DIFFICULTIES) {
      const n = TOPIC_BANK.filter((e) => e.difficulty === difficulty).length;
      expect(n).toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * @requirements #91 E7
 */
describe("pickTopicFallback", () => {
  it("選ばれた難易度のお題を source: fallback で返す", () => {
    const t = pickTopicFallback("Go", "hard", 0, null);
    const entry = TOPIC_BANK.find((e) => e.title === t.title);
    expect(entry?.difficulty).toBe("hard");
    expect(t.source).toBe("fallback");
  });

  it("直前と同じお題を返さない（どの種でも）", () => {
    for (let now = 0; now < 50; now++) {
      const first = pickTopicFallback("Python", "easy", now, null);
      const second = pickTopicFallback("Python", "easy", now, first);
      expect(second.title).not.toBe(first.title);
    }
  });

  it("境界を通り抜けて許可リストに無い言語が渡っても、難易度で絞らず全件から返す", () => {
    // 難易度を "easy" に固定して now を 0..32 で振る。プールが全 33 件なら
    // ちょうど 33 種のタイトルが出そろい、"easy" 以外の難易度も混ざる。
    // プールが誤って難易度で絞られたまま(この定型バンクは easy が 12 件)だと、
    // 33 種そろわず medium / hard も出てこない — その違いで区別する。
    const seen = new Set<string>();
    for (let now = 0; now < TOPIC_BANK.length; now++) {
      const t = pickTopicFallback("COBOL" as unknown as Language, "easy", now, null);
      expect(t.source).toBe("fallback");
      seen.add(t.title);
    }
    expect(seen.size).toBe(TOPIC_BANK.length);
    const gotDifficulties = new Set(
      [...seen].map((title) => TOPIC_BANK.find((e) => e.title === title)?.difficulty),
    );
    expect(gotDifficulties.has("medium")).toBe(true);
    expect(gotDifficulties.has("hard")).toBe(true);
  });
});

/**
 * 定型のお題の選び方の特性テスト（#365 Task 1）。
 *
 * 定型バンクの `languages` の欄を外す前に、選び方の結果を**並びまで**固定する。
 * 期待値は欄を外す前の実装で得た並びを直書きしたもの（定型バンクの並びと、種の剰余で決まる）。
 *
 * - 許可リストの言語では、どの言語でも同じ並びになる（言語の絞り込みが何も除いていない）
 * - 許可リストに無い言語では、難易度で絞らずに全 33 件から選ぶ
 * - 直前のお題は候補から除く
 */
describe("pickTopicFallback の選び方の特性（#365）", () => {
  const titles = (language: string, difficulty: Difficulty, seeds: readonly number[], previous: string | null) =>
    seeds.map(
      (now) =>
        pickTopicFallback(
          language as Language,
          difficulty,
          now,
          previous === null ? null : { title: previous, body: "", source: "fallback" },
        ).title,
    );
  const seedsUpTo = (n: number) => Array.from({ length: n }, (_, i) => i);

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
    it(`Given 許可リストのどの言語でも / When ${difficulty} を種 0.. で選ぶ / Then 同じ並びになる`, () => {
      // Given
      const expected = BY_DIFFICULTY[difficulty];
      for (const language of LANGUAGES) {
        // When
        const got = titles(language, difficulty, seedsUpTo(expected.length), null);
        // Then
        expect({ language, got }).toEqual({ language, got: expected });
      }
    });
  }

  it("Given 種が候補の数を超える・負 / When 選ぶ / Then 剰余（負は絶対値）で同じ並びをたどる", () => {
    // Given
    const easy = BY_DIFFICULTY.easy;
    // When
    const got = titles("Python", "easy", [easy.length, easy.length + 1, -1, -2], null);
    // Then
    expect(got).toEqual([easy[0], easy[1], easy[1], easy[2]]);
  });

  const AFTER_PREVIOUS: Record<Difficulty, { previous: string; titles: readonly string[] }> = {
    easy: { previous: "FizzBuzz", titles: [
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
      ] },
    medium: { previous: "ローマ数字変換", titles: [
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
      ] },
    hard: { previous: "行列の回転", titles: [
        "ボウリングのスコア計算",
        "LRU キャッシュ",
        "三目並べの勝敗判定",
        "ネストJSONの平坦化",
        "レート制限（トークンバケット）",
        "電卓（式の評価）",
      ] },
  };

  for (const difficulty of DIFFICULTIES) {
    it(`Given 直前のお題 / When ${difficulty} を種 0.. で選ぶ / Then 直前を除いた並びになる`, () => {
      // Given
      const { previous, titles: expected } = AFTER_PREVIOUS[difficulty];
      // When
      const got = titles("Go", difficulty, seedsUpTo(expected.length), previous);
      // Then
      expect(got).toEqual(expected);
    });
  }

  it("Given 許可リストに無い言語 / When easy を種 0..32 で選ぶ / Then 難易度で絞らず全 33 件の並びになる", () => {
    // Given
    const expected = [
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
    const got = titles("COBOL", "easy", seedsUpTo(expected.length), null);
    // Then
    expect(got).toEqual(expected);
  });
});
