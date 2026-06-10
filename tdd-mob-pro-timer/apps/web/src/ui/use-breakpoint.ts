/**
 * 画面幅ブレークポイント購読フック（PC 主役のレイアウト切替に使う）。
 * 既定は Tailwind の lg（1024px）。SSR/テスト（window 無し）では false を返す。
 */

import { useEffect, useState } from "react";

export function useIsWide(minWidth = 1024): boolean {
  const read = () => typeof window !== "undefined" && window.innerWidth >= minWidth;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    const onResize = () => setWide(read());
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
    // minWidth は固定運用（呼び出し側で定数）なので依存に含めない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
