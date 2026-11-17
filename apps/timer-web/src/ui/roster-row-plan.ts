/**
 * 名簿の 1 行に、どの操作を出すかの判断（#595 で `components/RosterPanel.tsx` の行の描画から出した）。
 * React にも I/O にも依存しない。判断は移す前のまま。
 */

import type { Participant } from "@tasuki/timer-core";

/** 行を決めるのに要る参加者の項目（`Participant` の部分） */
export type RosterRowParticipant = Pick<Participant, "participantId" | "presence" | "isPlaceholder" | "driverEligible">;

export interface RosterRowInput {
  participant: RosterRowParticipant;
  /** 現ドライバーの参加者 ID（識別子で判定する。配列位置ではない） */
  currentDriverId: string;
  myParticipantId: string;
  /** ドライバーのローテーション順（参加者 ID の配列）。無ければ全員が見学 */
  rotation: readonly string[] | undefined;
  /** 自分の一時離脱/復帰を外部の自己トグルが担うか */
  selfHasExternalToggle: boolean;
  hasMove: boolean;
  hasRemove: boolean;
  hasAssignDriver: boolean;
}

export interface RosterRowPlan {
  isCurrentDriver: boolean;
  isSkipping: boolean;
  /** ドライバー順での位置。-1 なら見学（rotation 外） */
  rotationIndex: number;
  inRotation: boolean;
  canMove: boolean;
  moveUpDisabled: boolean;
  moveDownDisabled: boolean;
  canRemove: boolean;
  /** 名前の行の右端のアイコンの操作（並べ替え・退出）の枠を出すか */
  showIconActions: boolean;
  /** 一時離脱/復帰のどちらを出すか（出さないなら null） */
  skipToggle: "skip" | "resume" | null;
  canAssign: boolean;
}

export function planRosterRow(input: RosterRowInput): RosterRowPlan {
  const { participant: p, currentDriverId, myParticipantId, rotation } = input;
  const isCurrentDriver = currentDriverId !== "" && p.participantId === currentDriverId;
  const isMine = p.participantId === myParticipantId;
  const isSkipping = p.driverEligible === false;
  // participants の配列位置と rotation の位置は一致しないので、rotation.indexOf で引く。
  const rotationIndex = rotation ? rotation.indexOf(p.participantId) : -1;
  const inRotation = rotationIndex >= 0;
  const rotationLen = rotation?.length ?? 0;
  // 並べ替えはドライバーが 2 人以上いるときだけ意味を持つ。
  const canMove = inRotation && rotationLen > 1 && input.hasMove;
  const canRemove = !isMine && input.hasRemove;
  // 一時離脱は輪の上の席の属性なので、見学の行には出さない。自分の分は外部トグルがあるなら出さない。
  const skipToggle = inRotation && (!isMine || !input.selfHasExternalToggle) ? (isSkipping ? "resume" : "skip") : null;
  // 実在のオフラインの相手は無人ドライバーになるので指名不可。代理は対面在席が常態なので offline でも指名可。
  const canAssign =
    input.hasAssignDriver &&
    inRotation &&
    !isCurrentDriver &&
    (p.presence !== "offline" || p.isPlaceholder === true);
  return {
    isCurrentDriver,
    isSkipping,
    rotationIndex,
    inRotation,
    canMove,
    moveUpDisabled: rotationIndex === 0,
    moveDownDisabled: rotationIndex === rotationLen - 1,
    canRemove,
    showIconActions: canMove || canRemove,
    skipToggle,
    canAssign,
  };
}
