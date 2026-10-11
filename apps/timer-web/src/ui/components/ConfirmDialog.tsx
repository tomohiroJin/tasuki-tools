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
  /** 確認ボタンの役割。"danger"（朱の枠・既定）か "primary"（主・真鍮）。 */
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
        <div className="ui-actions confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="ui-button ui-button--secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              confirmIntent === "primary"
                ? "ui-button"
                : "ui-button ui-button--danger"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
