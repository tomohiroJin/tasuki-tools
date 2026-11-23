/**
 * 取り消しの残り秒（#476・FR-21）。
 *
 * サーバーは期限の予約を持たず、配るときに残り（`remainingMs`）を計って載せる。画面は受け取ってからの経過を引いて数え、
 * 0 で下ろす（null を返す）。**計測していないときも数える**ので、手元の時計（`use-track-clock`）とは別に持つ。
 * 予約は「表示する秒が次に変わる時点」に 1 つだけ置く。
 */
import { useEffect, useState } from 'react';
import type { TrackView } from '@tasuki/track-core';
import { undoSecondsOf } from '../track-view';

const MS_PER_SEC = 1000;

export function useUndoSeconds(undo: TrackView['undo'], receivedAt: number): number | null {
  const [tick, setTick] = useState(0);
  const seconds = undo === null ? 0 : undoSecondsOf(undo.remainingMs, performance.now() - receivedAt);

  useEffect(() => {
    if (undo === null) return;
    const remaining = undo.remainingMs - (performance.now() - receivedAt);
    if (remaining <= 0) return;
    // 残りの秒（切り上げ）が次に変わるまで。境目ちょうどのタイマーが早く鳴っても空回りしないよう 1ms 足す
    const toNext = (remaining % MS_PER_SEC || MS_PER_SEC) + 1;
    const id = setTimeout(() => setTick((n) => n + 1), toNext);
    return () => clearTimeout(id);
  }, [undo, receivedAt, tick]);

  return seconds > 0 ? seconds : null;
}
