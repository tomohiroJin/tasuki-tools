/**
 * MonotonicClock ポート — 単調時計。
 *
 * **壁時計（epoch ms）ではない。** `performance.now()` 相当で、NTP のステップ調整で
 * 非単調になりうる値を渡してはならない（レート制限の窓の計測に使う。#103 設計正本 D8）。
 *
 * `WallClock`（`wall-clock.ts`）は epoch ms を返す壁時計で、意味が違う。名前を分けている。
 * poker のラウンド・レート制限・ルーレットの回転が使う。#367 で `poker-` の接頭辞を外した
 * （ポーカーだけのものではなくなっていた）。
 */
export interface MonotonicClock {
  now(): number;
}
