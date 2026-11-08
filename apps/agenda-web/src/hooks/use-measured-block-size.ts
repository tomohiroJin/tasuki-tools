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
    let written = '';
    const apply = (): void => {
      // 切り上げて 1px の余裕を持たせる（小数の高さを丸めて 1px 重なるのを避ける）
      written = `${Math.ceil(element.getBoundingClientRect().height)}px`;
      root.style.setProperty(variable, written);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => {
      observer.disconnect();
      // 自分が最後に書いた値のときだけ消す（2 つのインスタンスが重なったとき、片方が生きた値を消さない）
      if (root.style.getPropertyValue(variable) === written) root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}
