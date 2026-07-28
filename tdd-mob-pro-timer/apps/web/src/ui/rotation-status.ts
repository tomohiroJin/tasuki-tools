/**
 * 「各人の番がいつ来るか」を rotation から純粋計算する（#4）。
 * turnsAway: 0=今, 1=次, ... の循環距離。minutesAway: 交代間隔からの概算（停止中は null）。
 */

export interface MemberTurn {
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
  rotation: string[];
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

  const members: MemberTurn[] = rotation.map((name, i) => {
    const turnsAway = (i - currentIndex + len) % len;
    const minutesAway = isPaused ? null : Math.round((turnsAway * intervalSeconds) / 60);
    return {
      name,
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
