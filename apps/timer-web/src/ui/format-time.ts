/**
 * セッション表示用の時刻整形ユーティリティ（純関数）。
 */

/** mm:ss へゼロ埋め整形する。 */
function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 残り時間（秒）を mm:ss で整形する。**ceil** で丸める。
 * floor だと残り 0.9 秒でも「00:00」になり、最後の約1秒間 00:00 が据え置かれてから交代するため
 * 「時間が来てもすぐ交代しない」ラグに見える。ceil なら最後の1秒は「00:01」、真の 0（＝交代の
 * 瞬間）だけ「00:00」になり即時交代に見える。負値は 0 にクランプ。
 */
export function formatRemaining(seconds: number): string {
  return mmss(Math.ceil(Math.max(0, seconds)));
}

/** 経過時間(ms)を mm:ss で整形する（floor・秒未満切り捨て）。 */
export function formatElapsed(ms: number): string {
  return mmss(Math.floor(Math.max(0, ms) / 1000));
}
