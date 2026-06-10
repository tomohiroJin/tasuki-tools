/**
 * セッション終了系3操作の隔離ゾーン
 * T046: FR-018,019,044, SC-005 (US5)
 *
 * 完成 / 途中で終える（中断・記録なし） / リセット を意味差つきで
 * 別個の操作として提供し、破壊的操作には確認ダイアログを挟む（FR-019）。
 */

import React, { useState } from "react";
import { Flag, XCircle, RotateCcw } from "lucide-react";
import { GhostButton } from "../primitives.js";
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
      className="flex flex-wrap justify-center gap-2"
    >
      {/* 完成（達成として記録する）。正常完了は計器の安全色（緑）で強調し、危険操作と峻別する。 */}
      <button
        type="button"
        onClick={onComplete}
        className="px-5 py-2 rounded-md font-bold bg-[var(--ok)] hover:bg-[#4ac28c] text-[#04130c] transition-all shadow-[0_0_0_1px_rgba(63,178,127,0.5),0_4px_16px_rgba(63,178,127,0.3)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ok)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
      >
        <span className="flex items-center gap-2"><Flag className="w-4 h-4" aria-hidden="true" /> 完成!</span>
      </button>

      {/* 途中で終える（記録なし・確認あり）*/}
      <GhostButton onClick={() => setPending("abort")}>
        <span className="flex items-center gap-2"><XCircle className="w-4 h-4" aria-hidden="true" /> 途中で終える</span>
      </GhostButton>

      {/* リセット（初期化・確認あり）*/}
      <button
        type="button"
        onClick={() => setPending("reset")}
        className="px-4 py-2 rounded-md font-medium bg-[rgba(255,53,42,0.85)] hover:bg-[var(--urgent)] text-white border border-[rgba(255,53,42,0.4)] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--urgent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
      >
        <span className="flex items-center gap-2"><RotateCcw className="w-4 h-4" aria-hidden="true" /> リセット</span>
      </button>

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
