/**
 * `pickFallback` の選択結果を固定する特性テスト（#166 / #72 E3）。
 *
 * **この表は計算ではなく測定である。** 2026-08-18、main `e905b38`（`Date.now()` を
 * 内部で呼んでいた版）に対して `vi.setSystemTime(now)` でシステム時刻を固定し、
 * 実際に `pickFallback` を走らせて採取した。
 *
 * **`Math.abs(now) % candidates.length` をここで再計算してはならない。** 再計算は
 * 実装の写経であり、選択のロジックが壊れても表と実装が同時にずれるので緑のままになる
 * （`audit-log-hygiene` のテストが検査と同じ判定を再実装していたために、配線が消えても
 * 緑だった #158 と同型の罠）。
 */
import { describe, it, expect } from "vitest";
import { pickFallback, FALLBACK_PROBLEMS } from "../src/problem.js";

/** `[言語, 難易度, now, 期待する title]`。main `e905b38` で採取した実測値。 */
const GOLDEN: Array<[string, string, number, string]> = [
  ["TypeScript", "easy", 0, "FizzBuzz"],
  ["TypeScript", "easy", 1, "回文チェッカー"],
  ["TypeScript", "easy", 2, "銀行口座"],
  ["TypeScript", "easy", 3, "二数の和"],
  ["TypeScript", "easy", 4, "文字数カウント"],
  ["TypeScript", "easy", 5, "最大値を探す"],
  ["TypeScript", "easy", 1755500000000, "配列の合計と平均"],
  ["TypeScript", "hard", 0, "行列の回転"],
  ["TypeScript", "hard", 1, "ボウリングのスコア計算"],
  ["TypeScript", "hard", 2, "LRU キャッシュ"],
  ["TypeScript", "hard", 3, "三目並べの勝敗判定"],
  ["TypeScript", "hard", 4, "ネストJSONの平坦化"],
  ["TypeScript", "hard", 5, "レート制限（トークンバケット）"],
  ["TypeScript", "hard", 1755500000000, "レート制限（トークンバケット）"],
  ["COBOL-不明言語", "easy", 0, "FizzBuzz"],
  ["COBOL-不明言語", "easy", 1, "回文チェッカー"],
  ["COBOL-不明言語", "easy", 2, "ローマ数字変換"],
  ["COBOL-不明言語", "easy", 3, "銀行口座"],
  ["COBOL-不明言語", "easy", 4, "テニスゲームスコア"],
  ["COBOL-不明言語", "easy", 5, "行列の回転"],
  ["COBOL-不明言語", "easy", 1755500000000, "電卓（式の評価）"],
];

describe("pickFallback: 変更前の選択結果（ゴールデン値）", () => {
  /**
   * 母数のカナリア。**この 33 は意図的な直書きである。**
   *
   * 下の GOLDEN 表は定型バンクの中身に依存しているので、バンクが増減したら
   * 表は無効になる。`length` 同士を比べる書き方ではその変化を検知できない。
   *
   * **ここが赤くなったら、33 を書き換えて赤を消してはならない。**
   * `vi.setSystemTime` で採り直した値で GOLDEN 表を作り直すこと。
   */
  it("定型バンクは 33 件である（母数が変わったら GOLDEN 表を採り直す）", () => {
    expect(FALLBACK_PROBLEMS.length).toBe(33);
  });

  it.each(GOLDEN)(
    "%s / %s / now=%d は「%s」を選ぶ",
    (language, difficulty, now, expectedTitle) => {
      // When（変更後は now を引数で渡す。偽タイマーは不要）
      const result = pickFallback(language, difficulty, now);
      // Then
      expect(result.problem.title).toBe(expectedTitle);
      expect(result.source).toBe("fallback");
    },
  );
});
