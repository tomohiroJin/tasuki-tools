import { useEffect, type RefObject } from 'react';

/**
 * 要素の高さを測り、CSS 変数（`<html>` の style）へ書き込む（#554）。
 *
 * 下端に固定する帯（`.run-controls`・`.projection-strip`）の高さは、文字の大きさ・折り返し・端末の下の余白で変わる。手で写した値に頼ると、
 * 文字を大きくしたとき帯の下に最後の行が隠れる。そこで実際の高さを ResizeObserver で測り、変数へ入れる。
 * CSS の値（`run.css` の `:root`）は、JS が動く前の既定値として残す。ResizeObserver が無い環境（jsdom など）では何もしない。
 */
export function useMeasuredBlockSize(ref: RefObject<HTMLElement | null>, variable: `--${string}`): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const apply = (): void => {
      root.style.setProperty(variable, `${element.getBoundingClientRect().height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}
