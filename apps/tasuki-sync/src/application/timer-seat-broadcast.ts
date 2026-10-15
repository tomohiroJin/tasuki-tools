/**
 * 名簿の変化で timer の画面に映る席の情報が変わったら、timer へ配る（#374）。
 *
 * 席の「番が回らない理由」（`seatSkipReason`）は **timer に在席しているか** で決まる（D21）。
 * timer の購読者へ snapshot を配るのは timer のコマンド（`handlers.ts` の `commit`）だけだったので、
 * **ほかのツールの接続の出入り**（ハブ・お題・ルーレット・poker への参加、timer のタブだけを閉じる）で
 * 理由が変わっても timer の画面に届かず、席が古い理由のまま止まっていた。たとえば timer から
 * 選択画面へ移った人は、ほかの人の timer で「別の画面」ではなく「未接続」のまま残った。
 *
 * **呼ぶのは `saveRoster`（名簿を保管する唯一の場所）だけである。** 名簿を書く経路ごとに
 * 書き足すと、次に経路を足す人が配信を忘れる（ハブへの配信を対にしたのと同じ理由）。
 *
 * **映るものが実際に変わったときだけ配る。** 比べるのは名簿から導かれ、timer の画面に映るものに絞る:
 * 参加者ごとの在席（`presence`）、席ごとの理由（`skipReason`）、次の番（`nextIndex`）。
 * 輪に居ない人がハブを開いただけ、のような出入りで timer の全員へ snapshot を撒かない。
 * 名簿の参照が前後で同じなら（poker の投票のように名簿を触らない保管）、snapshot を組まずに返す。
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

/** timer の画面に映る、名簿から導かれる席の情報。 */
function seatView(room: Room): string {
  return JSON.stringify([
    room.participants.map((p) => [p.participantId, p.presence]),
    room.session.seats.map((s) => [s.id, s.skipReason]),
    room.session.nextIndex,
  ]);
}

/**
 * `before`（名簿を書く前）と `after`（書いた後）で timer の画面に映る席の情報が違えば、snapshot を配る。
 * そのルームに timer の状態が無ければ何もしない（timer を誰も開いていない）。
 */
export function broadcastTimerIfSeatViewChanged(
  deps: TimerSeatBroadcastDeps,
  before: MembershipRoom | undefined,
  after: MembershipRoom,
): void {
  if (before === after) return;
  const timer = deps.timers.get(after.code);
  if (!timer) return;
  const next = buildTimerSnapshotRoom(after, timer);
  if (before !== undefined && seatView(buildTimerSnapshotRoom(before, timer)) === seatView(next)) return;
  deps.timerBroadcaster.broadcastSnapshot(after.code, next);
}
