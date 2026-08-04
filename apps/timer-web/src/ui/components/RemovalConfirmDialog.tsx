/**
 * 退出確認ダイアログの生成（Issue #28 C-4）。
 * Lobby.tsx と RosterPanel.tsx の双方が持つ、ほぼ同一の ConfirmDialog 呼び出しを
 * 単一の共有コンポーネントへ一本化する（FR-177）。差分は isShared による説明文の
 * 分岐のみ。pendingRemovalId の state 自体は呼び出し側に残す（plan.md 参照）。
 * 判定（participantLabel）は participant-label.ts のものをそのまま使う（FR-178）。
 */

import type { Participant } from "@tasuki/timer-core";
import { participantLabel } from "../participant-label.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface RemovalConfirmDialogProps {
  /** 確認対象（居なければ何も描画しない）。identity のみで participants から都度引く既存設計を維持する。 */
  pendingRemoval: Participant | null;
  participants: readonly Participant[]; // participantLabel の同名判定に必要
  isShared: boolean; // Lobby は常に true を渡し、現状の文言を変えない
  onConfirm: (participantId: string) => void;
  onCancel: () => void;
}

export function RemovalConfirmDialog({
  pendingRemoval,
  participants,
  isShared,
  onConfirm,
  onCancel,
}: RemovalConfirmDialogProps) {
  if (!pendingRemoval) return null;

  return (
    <ConfirmDialog
      open={true}
      title={`${participantLabel(pendingRemoval.displayName, pendingRemoval.participantId, participants, "さん")}を退出させますか？`}
      description={`一覧とドライバーの輪から外れます。招待から再参加できます。${
        isShared ? "（他の参加者全員の画面にも反映されます）" : ""
      }`}
      confirmLabel="退出させる"
      confirmIntent="danger"
      onConfirm={() => onConfirm(pendingRemoval.participantId)}
      onCancel={onCancel}
    />
  );
}
