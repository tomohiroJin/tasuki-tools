/**
 * いまやっていること（#476・FR-1・FR-3・FR-21・FR-23）。
 *
 * 計測中は作業名・経過・［休憩にする］［止める］。止まっているときは状態の 1 行（記録が空なら使い方の 1 行も）。
 * **開始のボタンはここに置かない**（「切り替える」の欄の主のボタンが開始を兼ねる。開始は画面に 1 つ）。
 * 取り消しは、写しに `undo` がある間、残り秒つきで全員に出す。
 * 経過は live region にしない（毎秒読ませない。読み上げは画面の隠れた領域が受け持つ）。
 */
import { useId } from 'react';
import { durationOf, runningSegmentOf, type TrackView, type UndoKind } from '@tasuki/track-core';
import {
  BREAK_BUTTON,
  ELAPSED_LABEL,
  INTRO_TEXT,
  NOW_HEADING,
  NOW_IDLE,
  STOP_BUTTON,
  UNDO_BUTTON,
  UNDO_NOTE_AWAY,
  UNDO_NOTE_CLEAR,
  UNDO_NOTE_START,
  UNDO_NOTE_STOP,
  undoRemaining,
} from '../copy';
import { formatElapsed, isUnnamed, nameOf } from '../track-view';

const UNDO_NOTES: Record<UndoKind, string> = { start: UNDO_NOTE_START, stop: UNDO_NOTE_STOP, clear: UNDO_NOTE_CLEAR, away: UNDO_NOTE_AWAY };

interface Props {
  view: TrackView;
  nowMs: number;
  /** 取り消しの残り秒（出さないときは null） */
  undoSeconds: number | null;
  canOperate: boolean;
  onStop: () => void;
  onBreak: () => void;
  onUndo: (rev: number) => void;
}

export function NowPanel({ view, nowMs, undoSeconds, canOperate, onStop, onBreak, onUndo }: Props) {
  const headingId = useId();
  const running = runningSegmentOf(view);
  const undo = undoSeconds === null ? null : view.undo;
  return (
    <section className="track-now ui-panel ui-stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{NOW_HEADING}</h2>
      {running === null ? (
        <>
          <p className="track-now-idle">{NOW_IDLE}</p>
          {view.segments.length === 0 && <p className="ui-note track-intro">{INTRO_TEXT}</p>}
        </>
      ) : (
        <>
          <p className={isUnnamed(running) ? 'track-now-name track-name--unnamed' : 'track-now-name'}>{nameOf(running)}</p>
          <p className="track-now-elapsed">
            <span className="ui-visually-hidden">{ELAPSED_LABEL} </span>
            <span className="track-digits">{formatElapsed(durationOf(running, nowMs))}</span>
          </p>
          <div className="track-now-actions">
            {running.kind !== 'break' && (
              <button type="button" className="ui-button ui-button--secondary" disabled={!canOperate} onClick={onBreak}>
                {BREAK_BUTTON}
              </button>
            )}
            <button type="button" className="ui-button" disabled={!canOperate} onClick={onStop}>
              {STOP_BUTTON}
            </button>
          </div>
        </>
      )}
      {undo !== null && undoSeconds !== null && (
        <p className="track-undo">
          <span className="track-undo-note">{UNDO_NOTES[undo.kind]}</span>
          <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate} onClick={() => onUndo(undo.rev)}>
            {UNDO_BUTTON}
          </button>
          <span className="track-undo-remaining">{undoRemaining(undoSeconds)}</span>
        </p>
      )}
    </section>
  );
}
