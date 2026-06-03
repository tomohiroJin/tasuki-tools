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
