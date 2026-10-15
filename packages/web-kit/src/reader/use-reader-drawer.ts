/**
 * 「続きを読む」の引き出しの開閉とフォーカスを戻す処理（#371 で poker・topic・timer の札の写しを 1 つにした）。
 *
 * 引き出しは素の `<dialog class="ui-drawer">` をモーダルで開く（`showModal`）。**フォーカスを開いたボタンへ戻す
 * 経路は `onClose` の 1 本**（閉じるボタンも Esc も `close` イベントを通る。ブラウザは Esc で `close()` を
 * 呼ばずに `close` イベントだけを送る）。
 *
 * マークアップは各画面が持つ（札の構造が画面ごとに違う。topic はタブを持つ）。ここは振る舞いだけを持つ。
 */
import { useCallback, useRef, type RefObject } from 'react';

export interface ReaderDrawer {
  /** 引き出しの `<dialog>` に付ける。 */
  readonly dialogRef: RefObject<HTMLDialogElement | null>;
  /** 「続きを読む」のボタンに付ける。閉じたらここへフォーカスを戻す。 */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** 「続きを読む」の `onClick`。 */
  readonly open: () => void;
  /** 閉じるボタンの `onClick`。 */
  readonly close: () => void;
  /** `<dialog>` の `onClose`。 */
  readonly onClose: () => void;
}

export function useReaderDrawer(): ReaderDrawer {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = useCallback(() => dialogRef.current?.showModal(), []);
  const close = useCallback(() => dialogRef.current?.close(), []);
  const onClose = useCallback(() => triggerRef.current?.focus(), []);
  return { dialogRef, triggerRef, open, close, onClose };
}
