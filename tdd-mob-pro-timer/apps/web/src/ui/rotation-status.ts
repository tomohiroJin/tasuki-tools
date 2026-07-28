/**
 * 「各人の番がいつ来るか」を rotation から純粋計算する（#4）。
 * turnsAway: 0=今, 1=次, ... の循環距離。minutesAway: 交代間隔からの概算（停止中は null）。
 */

import type { RotationMember } from "./rotation-names.js";

export interface MemberTurn {
  /** 行の同定に使う識別子（表示名は同名で衝突しうるので key に使わない）。 */
  participantId: string;
  name: string;
  order: number;
  turnsAway: number;
  isCurrent: boolean;
  isNext: boolean;
  isSelf: boolean;
  minutesAway: number | null;
}

export interface RotationStatus {
  members: MemberTurn[];
  self: MemberTurn | null;
}

export function computeRotationStatus(args: {
  /** rotation の各枠（識別子＋表示名）。 */
  rotation: RotationMember[];
  currentIndex: number;
  intervalSeconds: number;
  /** rotation 内での自分の位置。輪の外なら -1。
   *  同名の別人と取り違えないよう、名前ではなく位置で自分を指す（D6b）。 */
  selfIndex: number;
  isPaused: boolean;
}): RotationStatus {
  const { rotation, currentIndex, intervalSeconds, selfIndex, isPaused } = args;
  const len = rotation.length;
  if (len === 0) return { members: [], self: null };

  const members: MemberTurn[] = rotation.map((member, i) => {
    const turnsAway = (i - currentIndex + len) % len;
    const minutesAway = isPaused ? null : Math.round((turnsAway * intervalSeconds) / 60);
    return {
      participantId: member.participantId,
      name: member.displayName,
      order: i + 1,
      turnsAway,
      isCurrent: turnsAway === 0,
      isNext: len > 1 && turnsAway === 1,
      isSelf: i === selfIndex,
      minutesAway,
    };
  });

  const self = members.find((m) => m.isSelf) ?? null;
  return { members, self };
}
