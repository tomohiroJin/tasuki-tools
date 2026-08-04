/**
 * カウントダウン用の現在時刻ティック（FR-007）。
 * 稼働中は一定間隔で再レンダリングして残り時間表示を進め、停止中は現在時刻に固定する。
 * anchorServerTime が変わる（交代＝新アンカー）たびにインターバルを張り直す。
 */

import { useEffect, useState } from "react";

/** 再描画間隔(ms)。短すぎると無駄な再描画、長すぎると表示が飛ぶ。 */
const TICK_MS = 200;

export function useNowTick(running: boolean, anchorServerTime: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      setNow(Date.now());
      return;
    }
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
    // anchorServerTime も依存に含め、交代でアンカーが変わったらティックを張り直す。
  }, [running, anchorServerTime]);
  return now;
}
