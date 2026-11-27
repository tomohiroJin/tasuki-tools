/**
 * 呼びかけ（ルームの在室者を同じ道具へ呼ぶ・#677）の規則。
 *
 * ハブのメッセージ層（`hub-handlers.ts`）が呼ぶ。ここには**宛先の選び方**と**連打の歯止め**だけを置く
 * （配信の口は別。呼びかけは保存しない・その場で配るだけ）。
 *
 * ## 宛先
 *
 * ルームの在室者のうち、**呼んだ人本人**と**その道具に接続を 1 本でも持つ人**を除いた人の、**すべての接続**
 * （ハブ・ほかのどの道具でも）。接続の無い人（切断中）は宛先に入らない（届ける先が無い）。
 * 「呼んだ本人」は接続でなく**人**で外す（本人のほかのタブにも出さない）。
 *
 * ## 連打の歯止め
 *
 * ルームごとに {@link CALL_INTERVAL_MS} に 1 回。前に**受け付けた**時刻だけをメモリに持つ
 * （拒んだ呼びかけは時刻を更新しない。更新すると押し続ける限り通らなくなる）。ルームの破棄で消す
 * （`destroy-room.ts`・憲法 III）。時計は単調時計（壁時計の巻き戻しで歯止めが外れない）。
 */
import { findParticipantByConnId, type Room } from "@tasuki/room-core";
import type { MonotonicClock } from "../ports/monotonic-clock.js";

/** 同じルームで呼びかけを受け付ける最小の間隔（ms）。ちょうどこの間隔なら通す。 */
export const CALL_INTERVAL_MS = 5_000;

/** 間隔が足りないときに、呼んだ人へ返す文言（コードは `CALL_TOO_SOON`）。 */
export const CALL_TOO_SOON_MESSAGE = "少し待ってから呼んでください。";

export interface RoomCallGate {
  /**
   * 受け付けてよければ時刻を記録して true、間隔が足りなければ記録せずに false。
   * 検査と記録を 1 つにしてある（間に別の呼びかけが挟まって二重に通らない）。
   */
  tryAccept(roomCode: string): boolean;
  /** ルームの破棄で、そのルームの時刻を捨てる。 */
  clearRoom(roomCode: string): void;
}

export function createRoomCallGate(clock: MonotonicClock): RoomCallGate {
  const lastAcceptedAt = new Map<string, number>();
  return {
    tryAccept(roomCode) {
      const now = clock.now();
      const last = lastAcceptedAt.get(roomCode);
      if (last !== undefined && now - last < CALL_INTERVAL_MS) return false;
      lastAcceptedAt.set(roomCode, now);
      return true;
    },
    clearRoom(roomCode) {
      lastAcceptedAt.delete(roomCode);
    },
  };
}

/** 呼びかけの宛先（接続 ID）。呼んだ本人と、その道具に居る人を外した、残りの人のすべての接続。 */
export function callRecipients(room: Room, callerConnId: string, tool: string): string[] {
  const caller = findParticipantByConnId(room, callerConnId);
  const ids: string[] = [];
  for (const participant of room.participants) {
    if (participant.id === caller?.id) continue;
    const declared = [...participant.connections.values()];
    if (declared.includes(tool)) continue;
    ids.push(...participant.connections.keys());
  }
  return ids;
}
