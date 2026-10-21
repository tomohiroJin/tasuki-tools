/**
 * 手元の時計（#429・spec §6.4）。
 *
 * サーバーの状態は「送る時点で計った経過」を運ぶ。画面はそこに**受け取ってからの時間**を足して盤を描く
 * （`advanceView`。進行中は計時が進み、一時停止中は実時間だけが進む）。
 * 描き直しの手段だけがここの仕事で、足し算の規則は agenda-core が持つ。
 *
 * - **描き直すのは、表示する秒が変わるときだけ**（PR #431 のレビュー）。盤の数字・スモールセコンドは秒で変わり、
 *   針は 60 分の盤で 1 秒に 0.1° しか動かないので、毎フレーム（60fps）画面全体を描き直さない。
 *   `requestAnimationFrame` で見張り、3 つの経過（区切りの計時・所要・実時間）の秒のどれかが変わった回だけ描き直す。
 *   残りが 0 になる瞬間は区切りの計時の秒の境目なので、時打ちの判定（`crossedZero`）は遅くとも 1 フレームで届く
 * - 動きを減らす設定では 1 秒ごと（rAF は使わない）
 * - 状態が無い・終わった状態は描き直さない（動かないものに予約を持たない）
 * - 外したら予約を取り消す
 */
import { useEffect, useRef, useState } from 'react';
import { advanceView, type AgendaView } from '@tasuki/agenda-core';

/** 動きを減らす設定での描き直しの間隔 */
const REDUCED_MOTION_TICK_MS = 1000;

const MS_PER_SEC = 1000;

/** 表示する秒の組。これが変わったときだけ描き直す */
const shownSecondsOf = (v: AgendaView): string =>
  `${Math.floor(v.stepTimerMs / MS_PER_SEC)}:${Math.floor(v.stepSpentMs / MS_PER_SEC)}:${Math.floor(v.runElapsedMs / MS_PER_SEC)}`;

export function useLocalClock(view: AgendaView | null, receivedAt: number, reducedMotion: boolean): AgendaView | null {
  // 描き直しの合図だけを持つ。値そのものは描くたびに `performance.now()` から導く。
  const [, setTick] = useState(0);
  const animated = view !== null && (view.phase === 'running' || view.phase === 'paused');
  const live = view === null ? null : advanceView(view, performance.now() - receivedAt);
  // 見張りの中で最新のフレームと、最後に描いた秒を読む（フレームが届いて描き直したときも秒を合わせる）
  const latest = useRef({ view, receivedAt });
  latest.current = { view, receivedAt };
  const shownRef = useRef<string | null>(null);
  shownRef.current = live === null ? null : shownSecondsOf(live);

  useEffect(() => {
    if (!animated) return;
    const redraw = (): void => setTick((n) => n + 1);
    if (reducedMotion) {
      const id = setInterval(redraw, REDUCED_MOTION_TICK_MS);
      return () => clearInterval(id);
    }
    let frameId = 0;
    const loop = (): void => {
      const { view: v, receivedAt: at } = latest.current;
      if (v !== null && shownSecondsOf(advanceView(v, performance.now() - at)) !== shownRef.current) redraw();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [animated, reducedMotion]);

  return live;
}
