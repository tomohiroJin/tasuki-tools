/**
 * 確認ダイアログ（破壊的操作用）
 * a11y: role="dialog" aria-modal、Esc で閉じる、開いたら取消ボタンへフォーカス。
 */

import React, { useRef } from "react";
import { GhostButton } from "../primitives.js";
import { useFocusTrap } from "../useFocusTrap.js";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 確認ボタンの色味。"danger"（赤・既定）か "primary"（fuchsia）。 */
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
      ? "bg-gradient-to-r from-fuchsia-500 to-violet-500 hover:from-fuchsia-400 hover:to-violet-400 shadow-fuchsia-500/30"
      : "bg-red-500/90 hover:bg-red-500 shadow-red-500/30 ring-1 ring-red-400/40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-md p-5 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-white/70">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl font-medium bg-white/10 hover:bg-white/20 border border-white/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 rounded-xl font-bold text-white shadow-lg transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
