import { useEffect, useRef, useState } from 'react';

/** 非セキュアオリジン向け。失敗しても一時欄とフォーカスを元へ戻す。 */
function legacyCopy(text: string): boolean {
  const focused = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } finally {
    textarea.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}

/** URL とコードのコピー。失敗時に手動で拾えるよう、呼び手は文字列を常時表示する。 */
export function useCopyText(text: string) {
  const [result, setResult] = useState<{ text: string; state: 'idle' | 'done' | 'failed' }>({ text, state: 'idle' });
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => {
    request.current += 1;
    clearTimeout(timer.current);
  }, [text]);

  const copy = async (): Promise<void> => {
    const current = ++request.current;
    clearTimeout(timer.current);
    let done = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        done = true;
      }
    } catch {
      // 権限拒否時も、従来のコピーを試す。
    }
    // 別の対象へ移動・アンマウントした後に古いコピーを続けない。
    if (current !== request.current) return;
    if (!done) {
      try { done = legacyCopy(text); } catch { /* 手動選択へ */ }
    }
    setResult({ text, state: done ? 'done' : 'failed' });
    timer.current = setTimeout(() => {
      if (current === request.current) setResult({ text, state: 'idle' });
    }, 2000);
  };

  return { copy, state: result.text === text ? result.state : 'idle' } as const;
}
