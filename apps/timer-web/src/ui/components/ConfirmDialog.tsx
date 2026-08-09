/**
 * 確認ダイアログ（破壊的操作用）
 * a11y: role="dialog" aria-modal、Esc で閉じる、開いたら取消ボタンへフォーカス。
 */

import React, { useRef } from "react";
import { useFocusTrap } from "../useFocusTrap.js";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 確認ボタンの色味。"danger"（赤・既定）か "primary"（シグナル朱）。 */
  confirmIntent?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "キャンセル",
  confirmIntent = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc クローズ・Tab トラップ・初期フォーカス（取消ボタン）・フォーカス復帰を共用フックで担う。
  useFocusTrap({
    open,
    containerRef: dialogRef,
    onClose: onCancel,
    initialFocusRef: cancelRef,
  });

  if (!open) return null;

  const confirmClass =
    confirmIntent === "primary"
      ? "bg-[var(--signal)] hover:bg-[var(--signal-hover)] text-[var(--on-signal)] shadow-[0_0_0_1px_var(--signal-edge),0_6px_20px_var(--signal-glow)]"
      : "bg-[var(--urgent)] hover:bg-[var(--urgent-hover)] text-[var(--on-urgent)] shadow-[0_4px_16px_var(--urgent-veil)] ring-1 ring-[var(--urgent-edge)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--shade)] backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-sm rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] p-5 shadow-[inset_0_1px_0_var(--inset-highlight),0_20px_50px_rgba(0,0,0,0.6)] text-[var(--bone)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold text-[var(--bone)]">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-[var(--bone-muted)]">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md font-medium text-[var(--bone)] bg-[var(--panel-2)] hover:bg-[var(--panel-hover)] border border-[var(--hairline-strong)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 rounded-md font-bold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)] ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
