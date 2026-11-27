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

/**
 * `target` は聞き手を付ける文書。既定はこのページ。ミニ表示の窓の文書を渡すと、窓にも同じ処理を付ける（`null` なら付けない）。
 */
export function useTrackKeys(handlers: TrackKeyHandlers, target: Document | null = document): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const current = latest.current;
      if (!current.enabled) return;
      const action = keyActionOf(event, {
        editable: isEditableTarget((target ?? document).activeElement),
        // 窓に付けたキーでも、本体の文書の確かめ・ダイアログを見る（窓の外で確かめが開いている間は S を拾わない）
        dialogOpen: document.querySelector(BLOCKING) !== null || (target ?? document).querySelector(BLOCKING) !== null,
      });
      if (action === null) return;
      if (action.type === 'candidate') current.onCandidate(action.index);
      else if (action.type === 'stop') current.onStop();
      else current.onResume();
    };
    if (target === null) return;
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }, [target]);
}
