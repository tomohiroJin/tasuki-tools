/**
 * WallClock ポート — 壁時計（epoch ms）。
 *
 * ルームの作成時刻・参加時刻・完成記録の時刻・ルームの回収など、**人が読む時刻**に使う。
 * NTP の調整で戻りうるので、間隔の計測（レート制限の窓・回転の経過）には使わない。そちらは
 * `MonotonicClock`（`monotonic-clock.ts`）。#367 で `Clock` から改めた（どちらも `now(): number` だけを
 * 持つので、型では区別できない。名前が意味を運ぶ）。
 */

export interface WallClock {
  /** 現在時刻 (epoch ms) を返す */
  now(): number;
}
