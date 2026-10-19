/**
 * 手元の時計（#429・spec §6.4）。
 *
 * サーバーの状態は「送る時点で計った経過」を運ぶ。画面はそこに**受け取ってからの時間**を足して、
 * 1 秒より細かく動く盤を描く（`advanceView`。進行中は計時が進み、一時停止中は実時間だけが進む）。
 * 描き直しの手段だけがここの仕事で、足し算の規則は agenda-core が持つ。
 *
 * - 通常は `requestAnimationFrame`（針をなめらかに動かす）
 * - 動きを減らす設定では 1 秒ごと（針を飛び飛びにする。rAF は使わない）
 * - 状態が無い・終わった状態は描き直さない（動かないものに予約を持たない）
 * - 外したら予約を取り消す
 */
import { useEffect, useState } from 'react';
import { advanceView, type AgendaView } from '@tasuki/agenda-core';

/** 動きを減らす設定での描き直しの間隔 */
const REDUCED_MOTION_TICK_MS = 1000;

export function useLocalClock(view: AgendaView | null, receivedAt: number, reducedMotion: boolean): AgendaView | null {
  // 描き直しの合図だけを持つ。値そのものは描くたびに `performance.now()` から導く。
  const [, setTick] = useState(0);
  const animated = view !== null && (view.phase === 'running' || view.phase === 'paused');

  useEffect(() => {
    if (!animated) return;
    const redraw = (): void => setTick((n) => n + 1);
    if (reducedMotion) {
      const id = setInterval(redraw, REDUCED_MOTION_TICK_MS);
      return () => clearInterval(id);
    }
    let frameId = 0;
    const loop = (): void => {
      redraw();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [animated, reducedMotion]);

  return view === null ? null : advanceView(view, performance.now() - receivedAt);
}
