/**
 * MonotonicClock ポート — 単調時計。
 *
 * **壁時計（epoch ms）ではない。** `performance.now()` 相当で、NTP のステップ調整で
 * 非単調になりうる値を渡してはならない（レート制限の窓の計測に使う。#103 設計正本 D8）。
 *
 * timer-sync の `Clock` は epoch ms を返す壁時計で、意味が違う。名前を分けている。
 * poker のドメインには時刻フィールドが 1 つも無いため、壁時計は要らない。
 */
export interface MonotonicClock {
  now(): number;
}
