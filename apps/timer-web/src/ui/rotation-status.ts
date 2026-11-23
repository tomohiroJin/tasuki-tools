/**
 * 「各人の番がいつ来るか」を rotation から純粋計算する（#4）。
 * turnsAway: 0=今, 1=次, ... 飛ばされる席を数えずに歩いた順番（#276 D13）。
 * 飛ばされる席自身は null。minutesAway: 交代間隔からの概算（停止中/turnsAway=null は null）。
 * ランダム交代（#660）では輪を歩かず、サーバーが決めた次の人だけに 1 を振る。
 */

import type { SeatSkipReason } from "@tasuki/timer-core";
import type { RotationMember } from "./rotation-names.js";

export interface MemberTurn {
  /** 行の同定に使う識別子（表示名は同名で衝突しうるので key に使わない）。 */
  participantId: string;
  /** 画面に出す呼び名。同名が並ぶときは識別子が付く（RotationMember.label）。 */
  name: string;
  order: number;
  /**
   * 飛ばされる席は null（#276 D13）。番が回らないので「あと何人」を持たない。
   * ランダム交代（#660）では、次の人より先の席も null（順番がまだ決まっていない）。
   */
  turnsAway: number | null;
  isCurrent: boolean;
  isNext: boolean;
  isSelf: boolean;
  minutesAway: number | null;
  /** その席が飛ばされる理由（RotationMember.skipReason）。null は「番が回る」。 */
  skipReason: SeatSkipReason | null;
}

export interface RotationStatus {
  members: MemberTurn[];
  self: MemberTurn | null;
}

export function computeRotationStatus(args: {
  /** rotation の各枠（識別子＋表示名）。 */
  rotation: RotationMember[];
  currentIndex: number;
  /** 次に実際にドライバーになる席の添字。サーバー権威（#276 D6）。輪が無い/全席不適格なら null。 */
  nextIndex: number | null;
  intervalSeconds: number;
  /** rotation 内での自分の位置。輪の外なら -1。
   *  同名の別人と取り違えないよう、名前ではなく位置で自分を指す（D6b）。 */
  selfIndex: number;
  isPaused: boolean;
  /**
   * ランダム交代か（#660）。輪の並びは「次に替わる順」を表さないので、輪を歩いて順番を振らない。
   * 分かるのはサーバーが決めた次の人（`nextIndex`）だけで、ほかの席の `turnsAway` は null になる。
   */
  random?: boolean;
}): RotationStatus {
  const { rotation, currentIndex, nextIndex, intervalSeconds, selfIndex, isPaused, random = false } = args;
  const len = rotation.length;
  if (len === 0) return { members: [], self: null };

  const turns = new Map<number, number>();
  if (random) {
    // 次の人だけが 1。その先はサーバーも画面へ配らない（交代のたびに引く）
    if (nextIndex !== null && nextIndex !== currentIndex) turns.set(nextIndex, 1);
  } else {
    // 現在地から交代の向きへ歩き、飛ばされる席を数えずに順番を振る（#276 D13）。
    // サーバーは不適格な席を飛ばして繰り上げるので、素朴な循環距離
    // （(i - currentIndex + len) % len）は実際の交代と食い違う。
    let n = 0;
    for (let step = 1; step <= len; step++) {
      const idx = (currentIndex + step) % len;
      if (idx === currentIndex) break;
      if (rotation[idx]!.skipReason !== null) continue;
      turns.set(idx, ++n);
    }
  }

  const members: MemberTurn[] = rotation.map((member, i) => {
    const isCurrent = i === currentIndex;
    // 現ドライバーは飛ばされる状態でも 0（運転中である）。
    const turnsAway = isCurrent ? 0 : (turns.get(i) ?? null);
    const minutesAway =
      isPaused || turnsAway === null ? null : Math.round((turnsAway * intervalSeconds) / 60);
    return {
      participantId: member.participantId,
      name: member.label,
      order: i + 1,
      turnsAway,
      isCurrent,
      isNext: nextIndex !== null && i === nextIndex,
      isSelf: i === selfIndex,
      minutesAway,
      skipReason: member.skipReason,
    };
  });

  const self = members.find((m) => m.isSelf) ?? null;
  return { members, self };
}
