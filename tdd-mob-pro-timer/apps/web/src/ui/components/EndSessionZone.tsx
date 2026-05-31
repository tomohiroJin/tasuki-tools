/**
 * セッション終了系3操作の隔離ゾーン
 * T046: FR-018,019,044, SC-005 (US5)
 *
 * 完成 / 途中で終える（中断・記録なし） / リセット を意味差つきで
 * 別個の操作として提供し、破壊的操作には確認ダイアログを挟む（FR-019）。
 */

import React, { useState } from "react";
import { Button } from "./Button.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface EndSessionZoneProps {
  onComplete: () => void;
  onAbort: () => void;
  onReset: () => void;
  /** 共有ルームか（true のとき確認ダイアログに他参加者への影響を表示） */
  isShared: boolean;
}

type PendingAction = "abort" | "reset" | null;

export function EndSessionZone({
  onComplete,
  onAbort,
  onReset,
  isShared,
}: EndSessionZoneProps) {
  const [pending, setPending] = useState<PendingAction>(null);

  const handleConfirm = () => {
    if (pending === "abort") onAbort();
    if (pending === "reset") onReset();
    setPending(null);
  };

  const sharedNote = isShared ? "（他の参加者全員の画面にも反映されます）" : "";

  const dialogConfig: Record<
    NonNullable<PendingAction>,
    { title: string; description: string }
  > = {
    abort: {
      title: "途中で終えますか？",
      description: `記録は残りません。${sharedNote}`,
    },
    reset: {
      title: "リセットしますか？",
      description: `タイマーと交代回数が初期状態に戻ります。${sharedNote}`,
    },
  };

  return (
    <div
      aria-label="セッションを終える"
      className="flex flex-wrap justify-center gap-2 border-t border-line pt-4 mt-4"
    >
      {/* 完成（達成として記録する）*/}
      <Button intent="accent" onClick={onComplete}>
        完成
      </Button>

      {/* 途中で終える（記録なし・確認あり）*/}
      <Button intent="warning" onClick={() => setPending("abort")}>
        途中で終える
      </Button>

      {/* リセット（初期化・確認あり）*/}
      <Button intent="danger" onClick={() => setPending("reset")}>
        リセット
      </Button>

      {/* 確認ダイアログ */}
      {pending && (
        <ConfirmDialog
          open={true}
          title={dialogConfig[pending].title}
          description={dialogConfig[pending].description}
          confirmLabel={pending === "abort" ? "終える（記録なし）" : "リセットする"}
          confirmIntent="danger"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
