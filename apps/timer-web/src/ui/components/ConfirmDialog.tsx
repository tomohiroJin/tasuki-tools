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
    modal: true,
  });

  if (!open) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="confirm-dialog-title">
          {title}
        </h2>
        {description && (
          <p className="confirm-dialog-description">{description}</p>
        )}
        <div className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              confirmIntent === "primary"
                ? "confirm-dialog-confirm confirm-dialog-confirm-primary"
                : "confirm-dialog-confirm confirm-dialog-confirm-danger"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
