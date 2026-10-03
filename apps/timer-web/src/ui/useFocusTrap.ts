/**
 * モーダル用フォーカストラップフック
 * a11y(WCAG 2.4.3): 開いている間は Tab/Shift+Tab をコンテナ内で循環させ、外へ移ったフォーカスは（モーダルなら）中へ戻し、
 * Esc で閉じ、開く前のフォーカス位置を閉じたとき復帰させる。
 *
 * ConfirmDialog と AiSettingsModal で同一ロジックを共用するために切り出す（DRY）。
 */

import { useEffect, useRef, type RefObject } from "react";

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
  /**
   * モーダル（`aria-modal="true"`）か。真なら、外へ移ったフォーカスを中へ戻す。
   * 外側のクリックで閉じるポップオーバー（通知設定）は偽のまま —— 引き戻すと、外の操作を奪う。
   */
  modal?: boolean;
}

export function useFocusTrap({
  open,
  containerRef,
  onClose,
  initialFocusRef,
  modal = false,
}: UseFocusTrapParams): void {
  // onClose は ref で持ち、effect の依存に入れない。呼び出し側は描画のたびに新しい関数を渡すので、
  // 依存に入れると開いている間の再描画のたびに effect が作り直され、後始末が「開く前のボタン」へ
  // フォーカスを戻して背後のページがスクロールし直す（#321 の比較の仕組みで見つけた）。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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
        onCloseRef.current();
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

    // モーダルのとき、フォーカスがコンテナの外へ移ったら中へ戻す。Tab の折り返しだけでは、背景をクリックしてから
    // Tab を押すと外の要素へ進めてしまう（onClose の再生成でフォーカスが引き戻されていた間は隠れていた）。
    const onFocusIn = (e: FocusEvent) => {
      const container = containerRef.current;
      if (!container || !(e.target instanceof Node) || container.contains(e.target)) return;
      focusInitial();
    };

    document.addEventListener("keydown", onKey);
    if (modal) document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (modal) document.removeEventListener("focusin", onFocusIn);
      previouslyFocused?.focus?.();
    };
  }, [open, containerRef, initialFocusRef, modal]);
}
