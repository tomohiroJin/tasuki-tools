/**
 * RandomSource ポート — ルーレットの乱数源（#94 spec R4）。
 *
 * **乱数の権威はサーバーである。** ドメイン（`@tasuki/roulette-core`）は環境から値を読まず、
 * 乱数はこのポート越しに引数で受ける（`scripts/audit-domain-side-effects.mjs`）。
 */
export interface RandomSource {
  /** `[0, n)` の整数。`n` は 1 以上。偏りが無いこと。 */
  randomInt(n: number): number;
  /** 当たりの席の中で止まる位置の揺らぎ（`SETTLE_MIN`〜`SETTLE_MAX`）。 */
  randomSettle(): number;
}
