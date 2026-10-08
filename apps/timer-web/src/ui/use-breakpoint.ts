/**
 * 画面幅ブレークポイント購読フック（PC 主役のレイアウト切替に使う）。
 * **画面の CSS と同じ問い合わせ `(width >= 64rem)` で判定する**（#316 D1・ADR 0025 決定 1）。
 * px（`innerWidth >= 1024`）で判定すると、既定の文字の大きさを変えた利用者で CSS とずれた。
 * `matchMedia` が無い環境では初期値だけを `innerWidth >= 1024` で答える（`resize` は購読しない。`matchMedia` が無いのは jsdom だけ）。
 */

import { useEffect, useState } from "react";

const WIDE_QUERY = "(width >= 64rem)";
const FALLBACK_WIDE_PX = 1024;

function readWide(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return window.innerWidth >= FALLBACK_WIDE_PX;
  return window.matchMedia(WIDE_QUERY).matches;
}

export function useIsWide(): boolean {
  const [wide, setWide] = useState(readWide);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = (e: { matches: boolean }) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/**
 * 現在のビューポート幅を購読するフック（モバイルで固定 px の計器を画面内に収めるために使う）。
 * SSR/テスト（window 無し）では fallback（既定 1024）を返す。
 */
export function useViewportWidth(fallback = 1024): number {
  const read = () => (typeof window !== "undefined" ? window.innerWidth : fallback);
  const [width, setWidth] = useState(read);
  useEffect(() => {
    const onResize = () => setWidth(read());
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return width;
}
