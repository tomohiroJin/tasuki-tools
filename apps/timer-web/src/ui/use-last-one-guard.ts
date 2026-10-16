/**
 * 休憩中に自分が最後の一人なら、閉じる前にブラウザの確認を出す（#402 設計 §5.4）。
 * 文言はブラウザ既定のものになる（こちらの文は出せない）。覆いの 1 行が説明を担う。
 */

import { useEffect } from "react";

export function useLastOneGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
