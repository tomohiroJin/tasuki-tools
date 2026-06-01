/**
 * モーダル用フォーカストラップフック
 * a11y(WCAG 2.4.3): 開いている間は Tab/Shift+Tab をコンテナ内で循環させ、
 * Esc で閉じ、開く前のフォーカス位置を閉じたとき復帰させる。
 *
 * ConfirmDialog と AiSettingsModal で同一ロジックを共用するために切り出す（DRY）。
 */

import { useEffect, type RefObject } from "react";

/** コンテナ内の focusable 要素を取得するセレクタ */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface UseFocusTrapParams {
  /** モーダルが開いているか */
  open: boolean;
  /** トラップ対象コンテナ（role="dialog" のラッパー）への ref */
  containerRef: RefObject<HTMLElement | null>;
  /** Esc キーで呼ぶクローズハンドラ */
  onClose: () => void;
  /** 開いたときに最初にフォーカスする要素（省略時はコンテナ内の先頭 focusable） */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useFocusTrap({
  open,
  containerRef,
  onClose,
  initialFocusRef,
}: UseFocusTrapParams): void {
  useEffect(() => {
    if (!open) return;

    // 開く前のフォーカス位置を保持し、閉じたら復帰させる。
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 初期フォーカス: 指定があればそれ、無ければコンテナ内の先頭 focusable。
    const focusInitial = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const focusables =
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      focusables?.[0]?.focus();
    };
    focusInitial();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;

      const focusables =
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, containerRef, onClose, initialFocusRef]);
}
