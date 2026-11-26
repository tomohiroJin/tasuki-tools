/**
 * ミニ表示の窓を持つフック（#476 第 2 段・設計 §5 D3）。
 *
 * 窓の API は `platform/mini-window.ts`。ここは窓の寿命（開く・閉じる・利用者が窓を閉じた・画面を外した）と、
 * 開いた窓の中に React を描く先（`container`。画面は `createPortal` で描く）を持つ。
 *
 * - 開いたら、元のページの見た目を窓へ写し、窓の `<body>` に描画先を 1 つ置く
 * - 窓が閉じられたら（`pagehide`）描画先を手放す。画面を外したら窓も閉じる
 * - すでに開いていれば、開き直さず窓を前に出す
 * - 開いている間に別の窓が割り込まないよう、開く要求の最中は重ねて頼まない
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { copyStylesInto, isMiniWindowSupported, requestMiniWindow } from '../platform/mini-window';

export interface MiniWindow {
  /** 対応ブラウザか（偽なら画面は「小さな窓で出す」を出さない） */
  readonly supported: boolean;
  /** 窓の中の描画先（開いていなければ null） */
  readonly container: HTMLElement | null;
  open(): Promise<void>;
  close(): void;
}

export function useMiniWindow(): MiniWindow {
  const [supported] = useState(isMiniWindowSupported);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const windowRef = useRef<Window | null>(null);
  const requestingRef = useRef(false);
  const mountedRef = useRef(true);

  const release = useCallback((): void => {
    windowRef.current = null;
    setContainer(null);
  }, []);

  const close = useCallback((): void => {
    windowRef.current?.close();
  }, []);

  const open = useCallback(async (): Promise<void> => {
    if (windowRef.current !== null) {
      windowRef.current.focus();
      return;
    }
    if (requestingRef.current) return;
    requestingRef.current = true;
    try {
      const win = await requestMiniWindow();
      if (win === null) return;
      // 待っている間に画面が外れていたら、開いた窓をそのまま閉じる
      if (!mountedRef.current) {
        win.close();
        return;
      }
      copyStylesInto(document, win.document);
      const target = win.document.createElement('div');
      target.className = 'track-mini-root';
      win.document.body.appendChild(target);
      win.addEventListener('pagehide', release, { once: true });
      windowRef.current = win;
      setContainer(target);
    } finally {
      requestingRef.current = false;
    }
  }, [release]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      windowRef.current?.close();
      windowRef.current = null;
    };
  }, []);

  return { supported, container, open, close };
}
