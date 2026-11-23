/**
 * キーボードの操作（#476・FR-26）。判定は `keys.ts`（純粋）。ここは `document` に聞き手を付ける端末 I/O。
 *
 * 聞き手は 1 つだけ付け、最新の操作は ref から読む（描き直すたびに付け外ししない）。
 * 確かめ（`[data-track-confirm]`）や開いた `<dialog>`（招待の QR など）がある間は拾わない。
 */
import { useEffect, useRef } from 'react';
import { isEditableTarget, keyActionOf } from '../keys';

/** キーを拾わせない、開いた確かめ・ダイアログ */
const BLOCKING = 'dialog[open], [data-track-confirm]';

export interface TrackKeyHandlers {
  /** 操作できるか（切断中は拾わない） */
  readonly enabled: boolean;
  /** 1〜9。`index` は 0 始まり（候補が無い番号でも呼ぶ。無ければ呼ばれた側が何もしない） */
  onCandidate(index: number): void;
  onStop(): void;
  onResume(): void;
}

export function useTrackKeys(handlers: TrackKeyHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const current = latest.current;
      if (!current.enabled) return;
      const action = keyActionOf(event, {
        editable: isEditableTarget(document.activeElement),
        dialogOpen: document.querySelector(BLOCKING) !== null,
      });
      if (action === null) return;
      if (action.type === 'candidate') current.onCandidate(action.index);
      else if (action.type === 'stop') current.onStop();
      else current.onResume();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
