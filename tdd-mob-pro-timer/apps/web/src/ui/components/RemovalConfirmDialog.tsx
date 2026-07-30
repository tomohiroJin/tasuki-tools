/**
 * 退出確認ダイアログの生成（Issue #28 C-4）。
 * Lobby.tsx と RosterPanel.tsx の双方が持つ、ほぼ同一の ConfirmDialog 呼び出しを
 * 単一の共有コンポーネントへ一本化する（FR-177）。差分は isShared による説明文の
 * 分岐のみ。pendingRemovalId の state 自体は呼び出し側に残す（plan.md 参照）。
 * この時点では空実装（T002）。実装は T006 で行う。
 */

import type { Participant } from "@tdd-mob/core";

interface RemovalConfirmDialogProps {
  /** 確認対象（居なければ何も描画しない）。identity のみで participants から都度引く既存設計を維持する。 */
  pendingRemoval: Participant | null;
  participants: readonly Participant[]; // participantLabel の同名判定に必要
  isShared: boolean; // Lobby は常に true を渡し、現状の文言を変えない
  onConfirm: (participantId: string) => void;
  onCancel: () => void;
}

export function RemovalConfirmDialog(_props: RemovalConfirmDialogProps): null {
  return null;
}
