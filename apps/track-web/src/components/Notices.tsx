/**
 * 知らせ（#476・FR-6・FR-24）。あるときだけ描く。どちらも操作を妨げない（重ねない・フォーカスを奪わない）。
 *
 * - 再開の問いかけ: 全員の切断で閉じた後。名前と時刻は最後の区切りから引く。どちらのボタンも全員に効く
 * - 止め忘れの知らせ: 同じ区切りが長く続いているとき（文は呼ぶ側が組む。数は `LONG_RUNNING_NOTICE_MS` から）
 * - 離れていたときの問いかけ（FR-27）: **戻ってきた本人の画面にだけ**出す（端末が覚えた値から。他の人の画面には出ない）。
 *   「そのまま残す」は何も送らず、残りの 2 つは送ると全員の画面に取り消しの帯が出る
 *
 * 読み上げは画面の隠れた領域（`aria-live`）が受け持つので、ここは live region にしない（二重に読ませない）。
 */
import type { TrackView } from '@tasuki/track-core';
import { AWAY_BREAK_BUTTON, AWAY_CUT_BUTTON, AWAY_KEEP_BUTTON, DISMISS_BUTTON, RESUME_BUTTON, awayPromptText, resumeOfferText } from '../copy';
import { clockOf, nameOf, type AwayPrompt } from '../track-view';

interface Props {
  view: TrackView;
  tzOffsetMin: number;
  /** 止め忘れの知らせの文（出さないときは null） */
  longRunningText: string | null;
  /** 離れていたときの問いかけ（出さないときは null） */
  awayPrompt: AwayPrompt | null;
  canOperate: boolean;
  onAwayKeep: () => void;
  onAwayCut: () => void;
  onAwayBreak: () => void;
  onResume: () => void;
  onDismiss: () => void;
}

export function Notices({ view, tzOffsetMin, longRunningText, awayPrompt, canOperate, onAwayKeep, onAwayCut, onAwayBreak, onResume, onDismiss }: Props) {
  const last = view.segments.at(-1);
  const offer = view.resumeOffer && last !== undefined && last.endMs !== null ? last : null;
  if (offer === null && longRunningText === null && awayPrompt === null) return null;
  return (
    <div className="track-notices">
      {offer !== null && (
        <div className="track-notice" data-notice="resume-offer">
          <p className="track-notice-text">{resumeOfferText(nameOf(offer), clockOf(view, offer.endMs ?? 0, tzOffsetMin))}</p>
          <div className="track-notice-actions">
            <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate} onClick={onDismiss}>
              {DISMISS_BUTTON}
            </button>
            <button type="button" className="ui-button ui-button--sm" disabled={!canOperate} onClick={onResume}>
              {RESUME_BUTTON}
            </button>
          </div>
        </div>
      )}
      {awayPrompt !== null && (
        <div className="track-notice" data-notice="away">
          <p className="track-notice-text">{awayPromptText(awayPrompt.awayMin)}</p>
          <div className="track-notice-actions">
            <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onAwayKeep}>
              {AWAY_KEEP_BUTTON}
            </button>
            <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate} onClick={onAwayCut}>
              {AWAY_CUT_BUTTON}
            </button>
            <button type="button" className="ui-button ui-button--sm" disabled={!canOperate} onClick={onAwayBreak}>
              {AWAY_BREAK_BUTTON}
            </button>
          </div>
        </div>
      )}
      {longRunningText !== null && (
        <div className="track-notice" data-notice="long-running">
          <p className="track-notice-text">{longRunningText}</p>
        </div>
      )}
    </div>
  );
}
