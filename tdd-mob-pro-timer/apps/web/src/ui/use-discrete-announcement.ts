/**
 * 支援技術向けの離散アナウンス（FR-035）。
 *
 * 連続カウントは読み上げず、状態変化（交代・残りわずか・一時停止・休憩）だけを
 * assertive リージョンへ流す文字列を生成する。同一文言が連続しても再読み上げされるよう、
 * 末尾に不可視のゼロ幅スペースを交互付与して DOM テキストを必ず変化させる
 * （aria-live はテキスト変化時のみ発火するため）。
 */

import { useEffect, useRef, useState } from "react";
import { deriveAnnouncement, type AnnounceState } from "./announce.js";

const ZERO_WIDTH_SPACE = "​";

export function useDiscreteAnnouncement(state: AnnounceState): string {
  const [announcement, setAnnouncement] = useState("");
  const prevRef = useRef<AnnounceState | null>(null);
  const seqRef = useRef(0);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!prev) return;
    const msg = deriveAnnouncement(prev, state);
    if (msg) {
      seqRef.current += 1;
      setAnnouncement(msg + ZERO_WIDTH_SPACE.repeat(seqRef.current % 2));
    }
    // 個々のフィールドを依存にし、状態変化時のみ発火させる（オブジェクト同一性に依存しない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.running,
    state.isPaused,
    state.onBreak,
    state.currentIndex,
    state.isUrgent,
    state.driverName,
  ]);
  return announcement;
}
