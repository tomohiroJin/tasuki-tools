/**
 * Clock ポート — 時刻の取得
 */

export interface Clock {
  /** 現在時刻 (epoch ms) を返す */
  now(): number;
}
