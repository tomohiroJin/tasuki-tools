/**
 * キーボードの判定（#476・FR-26）。**純粋関数**（聞き手を付けるのは `hooks/use-track-keys.ts`）。
 *
 * 1〜9 で候補へ切り替え・S で止める・C で直前の作業を再開する。
 * 入力中・修飾キーつき・IME の変換中・押しっぱなし・確かめが開いている間は拾わない。
 */

/** `KeyboardEvent` のうち、判定に使う項目 */
export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  /** Safari は変換の確定のキーで `isComposing` が偽になり、keyCode が 229 になる */
  readonly keyCode: number;
  readonly repeat: boolean;
}

export interface KeyContext {
  /** 入力欄・選択欄・textarea・contenteditable にフォーカスがある */
  readonly editable: boolean;
  /** 確かめやダイアログが開いている */
  readonly dialogOpen: boolean;
}

export type KeyAction = { readonly type: 'candidate'; readonly index: number } | { readonly type: 'stop' } | { readonly type: 'resume' };

const IME_KEY_CODE = 229;

export function keyActionOf(event: KeyInput, context: KeyContext): KeyAction | null {
  if (context.editable || context.dialogOpen) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (event.isComposing || event.keyCode === IME_KEY_CODE) return null;
  if (/^[1-9]$/.test(event.key)) return { type: 'candidate', index: Number(event.key) - 1 };
  const key = event.key.toLowerCase();
  if (key === 's') return { type: 'stop' };
  if (key === 'c') return { type: 'resume' };
  return null;
}

/** フォーカスのある要素が、字を入れる・選ぶ要素か。 */
export function isEditableTarget(element: Element | null): boolean {
  if (element === null) return false;
  if (element.matches('input, select, textarea')) return true;
  return element.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}
