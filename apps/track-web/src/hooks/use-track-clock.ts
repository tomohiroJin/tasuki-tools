/**
 * 手元の時計（#476・設計 §4.1）。
 *
 * サーバーの写しは「送る時点の時刻軸の位置」（`nowMs`）を運ぶ。画面はそこに**受け取ってからの時間**を足して
 * 「いま」の位置を求める（`advanceNow`。足し算の規則は track-core が持つ）。ここの仕事は描き直しの手段だけ。
 *
 * - **描き直すのは、表示する秒が変わるときだけ**（agenda-web の `use-local-clock` と同じ考え方）。
 *   `requestAnimationFrame` で見張り、経過と合計の秒（`shownSecondsKey`）が変わった回だけ描き直す
 * - 裏のタブでは rAF が呼ばれないので、1 秒の間隔でも同じ見張りを回す（タブの題を進めるため）
 * - 動きを減らす設定では 1 秒ごと（rAF は使わない）
 * - **計測していないときは予約を持たない**（動かないものを見張らない）。取り消しの残りは `use-undo-seconds` が別に数える
 * - 外したら予約を取り消す
 *
 * 返す位置は整数（境界のスキーマが整数だけを受けるので、手直しの計算へそのまま使える）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { advanceNow, runningSegmentOf, type TrackView } from '@tasuki/track-core';
import { secondPhasesOf, shownSecondsKey } from '../track-view';

/** 動きを減らす設定での描き直しの間隔 */
const REDUCED_MOTION_TICK_MS = 1000;

/** 裏のタブ（rAF が止まる）のための見張りの間隔 */
const BACKGROUND_TICK_MS = 1000;

const positionOf = (view: TrackView, receivedAt: number): number => Math.floor(advanceNow(view, performance.now() - receivedAt));

/** 表示する秒の組（止まっていれば空）。 */
function keyOf(view: TrackView, receivedAt: number, phases: readonly number[]): string {
  const running = runningSegmentOf(view);
  return running === null ? '' : shownSecondsKey(phases, positionOf(view, receivedAt) - running.startMs);
}

export interface TrackClock {
  /** 描いた時点の「いま」の位置（時刻軸・整数） */
  readonly nowMs: number;
  /** 呼んだ時点の「いま」の位置。押した瞬間の計算に使う（止まっている間は描き直さないので、描いた値は古い） */
  readonly getNow: () => number;
}

export function useTrackClock(view: TrackView, receivedAt: number, reducedMotion: boolean): TrackClock {
  // 描き直しの合図だけを持つ。値そのものは描くたびに `performance.now()` から導く。
  const [, setTick] = useState(0);
  const running = runningSegmentOf(view);
  const animated = running !== null;
  const phases = useMemo(() => secondPhasesOf(view), [view]);
  const nowMs = positionOf(view, receivedAt);
  // 見張りの中で最新の写しと、最後に描いた秒を読む（フレームが届いて描き直したときも秒を合わせる）
  const latest = useRef({ view, receivedAt, phases });
  latest.current = { view, receivedAt, phases };
  const shownRef = useRef('');
  shownRef.current = keyOf(view, receivedAt, phases);

  useEffect(() => {
    if (!animated) return;
    const redraw = (): void => setTick((n) => n + 1);
    if (reducedMotion) {
      const id = setInterval(redraw, REDUCED_MOTION_TICK_MS);
      return () => clearInterval(id);
    }
    const check = (): void => {
      const { view: v, receivedAt: at, phases: p } = latest.current;
      if (keyOf(v, at, p) !== shownRef.current) redraw();
    };
    let frameId = 0;
    const loop = (): void => {
      check();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    // 裏のタブでは rAF が呼ばれない。タブの題（別のタブを見ているときに役に立つ）を進めるため、タイマーでも見張る
    // （裏では間引かれるが、題は 1 分ごとなので足りる）。描き直すのは、表と同じく秒が変わったときだけ
    const backgroundId = setInterval(check, BACKGROUND_TICK_MS);
    return () => {
      cancelAnimationFrame(frameId);
      clearInterval(backgroundId);
    };
  }, [animated, reducedMotion]);

  const getNow = useCallback((): number => positionOf(latest.current.view, latest.current.receivedAt), []);
  return { nowMs, getNow };
}
