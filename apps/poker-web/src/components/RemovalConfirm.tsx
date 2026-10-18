// 接続の無い人を外す前の確認（#419・設計 §7a.2 G-4）。ネイティブの `<dialog>`（`showModal`）。
// フォーカスは `showModal` が最初の操作部品へ移し、閉じたあとの戻し先は呼び出し側が決める。
import { useEffect, useRef } from 'react';
import { CANCEL, REMOVE } from '../spectator-copy';

interface Props {
  /** 確認の題 */
  title: string;
  /** 接続が切れている間は確定できない */
  disabled?: boolean;
  /** 「退出させる」で確定した */
  onConfirm: () => void;
  /** 「キャンセル」・Esc で閉じた（確定では呼ばれない） */
  onCancel: () => void;
}

/** 開くときだけ描く（呼び出し側が対象のあるあいだだけ置く）。置いた時点で `showModal` する。 */
export function RemovalConfirm({ title, disabled = false, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 確定の経路で閉じたとき、`close` イベントを取り消しと取り違えない
  const confirmedRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="removal-confirm"
      aria-labelledby="poker-removal-title"
      onClose={() => {
        if (!confirmedRef.current) onCancel();
      }}
    >
      <h3 id="poker-removal-title">{title}</h3>
      <div className="removal-confirm-actions">
        <button
          type="button"
          className="ui-button ui-button--secondary"
          onClick={() => dialogRef.current?.close()}
        >
          {CANCEL}
        </button>
        <button
          type="button"
          className="ui-button ui-button--danger"
          disabled={disabled}
          onClick={() => {
            confirmedRef.current = true;
            dialogRef.current?.close();
            onConfirm();
          }}
        >
          {REMOVE}
        </button>
      </div>
    </dialog>
  );
}
