/**
 * タブの題（#476・FR-22）。`document.title` に触る端末 I/O。題の文は `tabTitleOf`（純粋）が組む。
 *
 * 題があれば書き、無ければ（止まっている）元の題へ戻す。外したときも元の題へ戻す。
 * 題の文は 1 分ごとにしか変わらないので、書き込みも 1 分ごとになる（依存が文字列なので、同じ文では走らない）。
 */
import { useEffect, useRef } from 'react';

export function useTabTitle(title: string | null): void {
  // 元の題は最初の描画で覚える（自分が書いた題を「元」として覚えない）
  const originalRef = useRef<string | null>(null);
  if (originalRef.current === null) originalRef.current = document.title;

  useEffect(() => {
    const original = originalRef.current ?? '';
    document.title = title ?? original;
    return () => {
      document.title = original;
    };
  }, [title]);
}
