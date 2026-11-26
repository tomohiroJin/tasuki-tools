/**
 * ミニ表示の中身（#476 第 2 段・設計 §5 D3）。Document Picture-in-Picture の窓へ `createPortal` で描く。
 *
 * いまの作業名・経過・［止める］［休憩にする］［直前を再開］。操作は S・C キーと同じもの
 * （止める = `stop`・直前を再開 = `previousLabelOf` の名前で開始）を、ルームの画面から受け取って呼ぶだけ。
 * 経過は、**窓のタイマー**で 1 秒ごとに描き直す（別のタブで作業している間、元のページの描き直しは間引かれるため）。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { durationOf, previousLabelOf, runningSegmentOf, type TrackView } from '@tasuki/track-core';
import { BREAK_BUTTON, MINI_RESUME_BUTTON, NOW_IDLE, STOP_BUTTON } from '../copy';
import { formatElapsed, isUnnamed, nameOf } from '../track-view';

const TICK_MS = 1000;

interface Props {
  /** 窓の中の描画先（`useMiniWindow` が置く） */
  container: HTMLElement;
  view: TrackView;
  /** 呼んだ時点の「いま」の位置 */
  getNow: () => number;
  canOperate: boolean;
  onStop: () => void;
  onBreak: () => void;
  onResume: () => void;
}

export function MiniView({ container, ...body }: Props) {
  return createPortal(<MiniBody container={container} {...body} />, container);
}

function MiniBody({ container, view, getNow, canOperate, onStop, onBreak, onResume }: Props) {
  const [, setTick] = useState(0);
  const running = runningSegmentOf(view);
  const animated = running !== null;

  useEffect(() => {
    if (!animated) return;
    // 窓のタイマーを使う（元のページが裏でも、窓は表に出ている）
    const win = container.ownerDocument.defaultView ?? window;
    const id = win.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => win.clearInterval(id);
  }, [animated, container]);

  return (
    <section className="track-mini ui-stack">
      {running === null ? (
        <p className="track-mini-name track-now-idle">{NOW_IDLE}</p>
      ) : (
        <>
          <p className={isUnnamed(running) ? 'track-mini-name track-name--unnamed' : 'track-mini-name'}>{nameOf(running)}</p>
          <p className="track-mini-elapsed track-digits">{formatElapsed(durationOf(running, getNow()))}</p>
        </>
      )}
      <div className="track-mini-actions">
        <button type="button" className="ui-button ui-button--sm" disabled={!canOperate || running === null} onClick={onStop}>
          {STOP_BUTTON}
        </button>
        <button
          type="button"
          className="ui-button ui-button--secondary ui-button--sm"
          disabled={!canOperate || running === null || running.kind === 'break'}
          onClick={onBreak}
        >
          {BREAK_BUTTON}
        </button>
        <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate || previousLabelOf(view) === null} onClick={onResume}>
          {MINI_RESUME_BUTTON}
        </button>
      </div>
    </section>
  );
}
