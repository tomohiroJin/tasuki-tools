// 隠しの入口の配線（#403・設計 §5.1）。判定は `secret-entry.ts`。
import { useEffect, useRef } from 'react';
import { KONAMI_CODE, TAP_COUNT, advanceSequence, advanceTaps } from '../secret-entry';

/** 打ち込みの最中は入口として数えない（入力欄・選択・編集できる要素） */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * コナミコマンドを聞き、見出しに付ける押下の受け口を返す。どちらかが揃ったら `onOpen` を呼ぶ。
 *
 * `enabled` が偽（切断中など）の間は数えない。押しても送れないのに、揃った手応えだけを返さない。
 */
export function useSecretEntry(onOpen: () => void, enabled: boolean): () => void {
  const progress = useRef(0);
  const taps = useRef<number[]>([]);
  const open = useRef(onOpen);
  const live = useRef(enabled);
  useEffect(() => {
    open.current = onOpen;
    live.current = enabled;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!live.current || isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        progress.current = 0;
        return;
      }
      progress.current = advanceSequence(progress.current, event.key);
      if (progress.current === KONAMI_CODE.length) {
        progress.current = 0;
        open.current();
      }
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, []);

  return () => {
    if (!live.current) return;
    taps.current = advanceTaps(taps.current, Date.now());
    if (taps.current.length >= TAP_COUNT) {
      taps.current = [];
      open.current();
    }
  };
}
