/**
 * 名簿の変化で timer の画面に映るもの（在席・席の理由・次の番）が変わったら、timer へ配る（#374）。
 *
 * 席の「番が回らない理由」（`seatSkipReason`）は **timer に在席しているか** で決まる（D21）。
 * timer の購読者へ snapshot を配るのは timer のコマンド（`handlers.ts` の `commit`）だけだったので、
 * **ほかのツールの接続の出入り**（ハブ・お題・ルーレット・poker への参加、timer のタブだけを閉じる）で
 * 理由が変わっても timer の画面に届かず、席が古い理由のまま止まっていた。たとえば timer から
 * 選択画面へ移った人は、ほかの人の timer で「別の画面」ではなく「未接続」のまま残った。
 *
 * **映るものが実際に変わったときだけ配る。** 輪に居ない人がハブを開いただけ、のような出入りで
 * timer の全員へ snapshot を撒かない。比べるのは名簿から導く部分だけである（`participants`・
 * `seats`・`nextIndex`）。timer の状態そのものは前後で同じものを渡すので変わらない。
 *
 * 名簿を書く経路（`saveRoster` の呼び出し元）のうち、timer の状態も書く `handlers.ts` の
 * `commit` は自分で配るので、ここを通さない。
 */
import type { Room as MembershipRoom } from "@tasuki/room-core";
import type { Room } from "@tasuki/timer-core";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { TimerStore } from "../ports/timer-store.js";
import { buildTimerSnapshotRoom } from "./timer-snapshot-dto.js";

export interface TimerSeatBroadcastDeps {
  timers: TimerStore;
  /** timer の購読者への配信（poker・お題・ルーレットの `broadcaster` とは別物）。 */
  timerBroadcaster: Broadcaster;
}

/** 名簿から導く、timer の画面に映る部分。 */
function rosterView(room: Room): string {
  return JSON.stringify([room.participants, room.session.seats, room.session.nextIndex]);
}

/**
 * `before`（名簿を書く前）と `after`（書いた後）で timer の画面に映るものが違えば、snapshot を配る。
 * そのルームに timer の状態が無ければ何もしない（timer を誰も開いていない）。
 */
export function broadcastTimerIfRosterViewChanged(
  deps: TimerSeatBroadcastDeps,
  before: MembershipRoom | undefined,
  after: MembershipRoom,
): void {
  const timer = deps.timers.get(after.code);
  if (!timer) return;
  const next = buildTimerSnapshotRoom(after, timer);
  if (before !== undefined && rosterView(buildTimerSnapshotRoom(before, timer)) === rosterView(next)) return;
  deps.timerBroadcaster.broadcastSnapshot(after.code, next);
}
