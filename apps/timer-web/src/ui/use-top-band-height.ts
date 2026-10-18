/**
 * 上端の帯（`.app-top`）の下端を CSS 変数 `--top-band-height` に書くフック（#427・設計 B）。
 * 休憩の覆いの中身は、この下端の下から始める（`break.css` の `.break-overlay`）。名前の長い休憩の知らせが
 * 狭い幅で何行に折り返しても、帯の下端に追従する。
 *
 * **高さではなく下端（画面上端からの距離）を測る。** 帯は `position: sticky; top: 0` で、ページの先頭では
 * Stage の余白ぶん下がった位置にあり、スクロールすると上端に留まる。下端ならどちらでも覆いの中身の始点になる。
 * 位置はスクロールと画面の幅（上の余白が変わる）で変わるので `scroll` と `resize` も購読する。
 *
 * 要素が無い間は何も書かない。外すとき（アンマウント・ref の付け替え）は変数を消す。
 */

import { useEffect } from "react";
import type { RefObject } from "react";

const VAR = "--top-band-height";

export function useTopBandHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty(VAR, `${Math.max(0, el.getBoundingClientRect().bottom)}px`);
    write();
    window.addEventListener("scroll", write, { passive: true });
    window.addEventListener("resize", write);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(write);
    observer?.observe(el);
    return () => {
      window.removeEventListener("scroll", write);
      window.removeEventListener("resize", write);
      observer?.disconnect();
      root.style.removeProperty(VAR);
    };
  }, [ref]);
}
