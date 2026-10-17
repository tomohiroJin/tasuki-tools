/**
 * カウントダウン用の現在時刻ティック（FR-007）。
 * 稼働中は一定間隔で再レンダリングして残り時間表示を進め、停止中は現在時刻に固定する。
 * 休憩中は時計が止まっているが、休憩の経過を数え上げるので時刻を進める（#402）。
 * そのため第 1 引数は「時計が走っているか」ではなく「時刻を進めるか」。
 * anchorServerTime が変わる（交代＝新アンカー）たびにインターバルを張り直す。
 * 間隔は呼ぶ側が決める。休憩中は経過を秒単位で出すだけなので 1 秒で足りる（PR #416 のレビュー。
 * 200ms のままだと止まった画面全体を 1 秒に 5 回描き直す）。
 */

import { useEffect, useState } from "react";

/** 走行中の再描画間隔(ms)。短すぎると無駄な再描画、長すぎると表示が飛ぶ。 */
export const RUNNING_TICK_MS = 200;
/** 休憩中の再描画間隔(ms)。覆いの経過は秒単位 */
export const BREAK_TICK_MS = 1000;

export function useNowTick(ticking: boolean, anchorServerTime: number, intervalMs: number = RUNNING_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) {
      setNow(Date.now());
      return;
    }
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
    // anchorServerTime も依存に含め、交代でアンカーが変わったらティックを張り直す。
  }, [ticking, anchorServerTime, intervalMs]);
  return now;
}
