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
  selfName: string;
  isPaused: boolean;
}): RotationStatus {
  const { rotation, currentIndex, intervalSeconds, selfName, isPaused } = args;
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
      isSelf: name === selfName,
      minutesAway,
    };
  });

  const self = members.find((m) => m.isSelf) ?? null;
  return { members, self };
}
