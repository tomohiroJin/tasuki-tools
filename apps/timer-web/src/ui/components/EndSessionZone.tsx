/**
 * セッション終了系3操作の隔離ゾーン
 * T046: FR-018,019,044, SC-005 (US5)
 *
 * 完成 / 途中で終える（中断・記録なし） / リセット を意味差つきで
 * 別個の操作として提供し、破壊的操作には確認ダイアログを挟む（FR-019）。
 */

import React, { useState } from "react";
import { Flag, XCircle, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface EndSessionZoneProps {
  onComplete: () => void;
  onAbort: () => void;
  onReset: () => void;
  /** 共有ルームか（true のとき確認ダイアログに他参加者への影響を表示） */
  isShared: boolean;
}

// 完成も確認を課す（Issue #22・FR-074b）。誰でも実行でき、誤操作の影響が全員に及ぶため。
// 中断・リセットとは違い記録は残るので問いを分ける。
type PendingAction = "complete" | "abort" | "reset" | null;

/** 確認ボタンの文言。何が起きるかを動詞で示し、「OK」のような曖昧な語を使わない。 */
const CONFIRM_LABELS: Record<"complete" | "abort" | "reset", string> = {
  complete: "完成として記録する",
  abort: "終える（記録なし）",
  reset: "最初から再スタート",
};

export function EndSessionZone({
  onComplete,
  onAbort,
  onReset,
  isShared,
}: EndSessionZoneProps) {
  const [pending, setPending] = useState<PendingAction>(null);

  const handleConfirm = () => {
    if (pending === "complete") onComplete();
    if (pending === "abort") onAbort();
    if (pending === "reset") onReset();
    setPending(null);
  };

  const sharedNote = isShared ? "（他の参加者全員の画面にも反映されます）" : "";

  const dialogConfig: Record<
    NonNullable<PendingAction>,
    { title: string; description: string }
  > = {
    // 「何が失われるか」ではなく「記録として締めてよいか」を問う。完成は破壊ではない。
    complete: {
      title: "このセッションを完成として記録しますか？",
      description: `タイマーを止めて記録に残し、まとめ画面へ移ります。${sharedNote}`,
    },
    abort: {
      title: "途中で終えますか？",
      description: `記録は残りません。${sharedNote}`,
    },
    reset: {
      title: "最初から再スタートしますか？",
      description: `タイマーを先頭・満タンに戻して走り直します（お題・メンバー・設定は維持）。${sharedNote}`,
    },
  };

  return (
    <div
      role="group"
      aria-label="セッションを終える"
      className="ui-actions"
    >
      {/* 取り消せない操作（朱の枠・危険）は左端へ離し、正常完了の主を右端（最後）に置く。
          押し間違えが「記録を残さずに終える」側へ倒れないよう、主から距離を取る（ADR 0025 決定 5）。 */}
      <div className="ui-actions-start">
        {/* 途中で終える（記録なし・確認あり）*/}
        <button type="button" className="ui-button ui-button--danger" onClick={() => setPending("abort")}>
          <span className="end-session-zone-label"><XCircle className="end-session-zone-icon" aria-hidden="true" /> 途中で終える</span>
        </button>

        {/* 最初から（先頭・満タンへ戻して走り直す・確認あり・v2.3 #3）*/}
        <button
          type="button"
          onClick={() => setPending("reset")}
          className="ui-button ui-button--danger"
        >
          <span className="end-session-zone-label"><RotateCcw className="end-session-zone-icon" aria-hidden="true" /> 最初から</span>
        </button>
      </div>

      {/* 完成（達成として記録する）。正常完了は主（金）、中断・リセットは朱の枠（危険）で峻別する。 */}
      <button
        type="button"
        onClick={() => setPending("complete")}
        className="ui-button"
      >
        <span className="end-session-zone-label"><Flag className="end-session-zone-icon" aria-hidden="true" /> 完成!</span>
      </button>

      {/* 確認ダイアログ */}
      {pending && (
        <ConfirmDialog
          open={true}
          title={dialogConfig[pending].title}
          description={dialogConfig[pending].description}
          confirmLabel={CONFIRM_LABELS[pending]}
          // 完成は正常完了なので危険色にしない（中断・リセットと視覚的に峻別する）。
          confirmIntent={pending === "complete" ? "primary" : "danger"}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
