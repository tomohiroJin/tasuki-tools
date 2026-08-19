/**
 * バナーの文言と自動消去タイマー（#167 E4）。
 *
 * **これは WebSocket の配線ではない。** `docs/adr/0015` の MUST 2 が
 * 「1 本に集約する」と言っているのは接続状態とメッセージ配線であって、
 * バナーの表示制御ではない。同期フックから分けても MUST 2 に反しない。
 *
 * 自動消去しないバナー（退出の通知）は Issue #32 の成果で、入口画面へ戻った後も
 * 「抜けたこと」を利用者が確認できるまで残す必要がある。
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Banner {
  text: string;
  kind: "warn" | "error";
}

export interface BannerController {
  banner: Banner | null;
  /** autoDismiss を省略すると既定で 4 秒後に消える。false で消えないバナーになる。 */
  show(text: string, kind: Banner["kind"], options?: { autoDismiss?: boolean }): void;
  clear(): void;
}

/** 一時的な操作エラーを自動消去するまでの時間。 */
const AUTO_DISMISS_MS = 4000;

export function useBanner(): BannerController {
  const [banner, setBanner] = useState<Banner | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const show = useCallback<BannerController["show"]>(
    (text, kind, options) => {
      // 新しいバナーを出すときは、必ず直前のタイマーを解除する。
      // 解除しないと、直前の一時エラーの 4 秒タイマーが新しいバナーを消してしまう。
      clearTimer();
      setBanner({ text, kind });
      if (options?.autoDismiss !== false) {
        timerRef.current = setTimeout(() => {
          setBanner(null);
          timerRef.current = null;
        }, AUTO_DISMISS_MS);
      }
    },
    [clearTimer],
  );

  const clear = useCallback(() => {
    clearTimer();
    setBanner(null);
  }, [clearTimer]);

  // unmount 時にタイマーを掃除する（setState-on-unmounted を防ぐ）。
  useEffect(() => clearTimer, [clearTimer]);

  return { banner, show, clear };
}
