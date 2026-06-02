/**
 * prefers-reduced-motion の購読フック（FR-025 / §10.4）
 *
 * 強演出（全画面交代通知など）を控えめ版へ切り替えるための判定に使う。
 * matchMedia が無い環境（テストの jsdom 既定など）では false を返す。
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function readInitial(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readInitial);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia(QUERY);
    const handler = () => setReduced(mq.matches);
    handler();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}
