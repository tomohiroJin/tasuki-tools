/**
 * 確認ダイアログ（破壊的操作用）
 * a11y: role="dialog" aria-modal、Esc で閉じる、開いたら取消ボタンへフォーカス。
 */

import React, { useRef } from "react";
import { Button, type ButtonIntent } from "./Button.js";
import { useFocusTrap } from "../useFocusTrap.js";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmIntent?: ButtonIntent;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "var(--color-overlay)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold text-fg">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-fg-muted">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button ref={cancelRef} intent="neutral" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button intent={confirmIntent} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
