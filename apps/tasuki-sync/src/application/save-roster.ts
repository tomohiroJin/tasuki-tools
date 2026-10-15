/**
 * 名簿を保管し、ハブへ新しい名簿を配信する（#95 S5a・R3）。
 *
 * **名簿を書く経路は 3 つあった**（`handlers.ts` の `commit` / `presence.ts` の切断処理 /
 * `poker-handlers.ts`）。ハブへの配信をその 3 つに書き足す形にすると、**次に 4 つ目を
 * 足す人が配信を忘れる**。保管と配信を対にして、`store.put` を呼ぶ場所をここ 1 つに閉じる
 * （`test/save-roster.wiring.test.ts` が「他に呼ぶ場所が無いこと」を機械的に固定している）。
 *
 * **timer の席の情報が変わったときの timer への配信もここで行う**（#374・`timer-seat-broadcast.ts`）。
 * 席の理由は在席から導かれるので、名簿を書くどの経路でも変わりうる。同じ理由でここへ閉じる。
 * timer の状態も書いて自分で snapshot を配る経路（`handlers.ts` の `commit`）は
 * `timerSnapshotSentByCaller` を立てて二重に配らない。
 *
 * **poker の round・お題・ルーレットの配信はここでは行わない。** それぞれの wire を組む場所が違う。
 */
import type { Room as MembershipRoom } from "@tasuki/room-core";
import type { RoomStore } from "../ports/room-store.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import { broadcastTimerIfSeatViewChanged, type TimerSeatBroadcastDeps } from "./timer-seat-broadcast.js";

export interface SaveRosterDeps extends TimerSeatBroadcastDeps {
  store: RoomStore;
  hub: HubBroadcaster;
}

export interface SaveRosterOptions {
  /** 呼び出し側がこの直後に timer の snapshot を自分で配る（`handlers.ts` の `commit`）。 */
  readonly timerSnapshotSentByCaller?: boolean;
}

export function saveRoster(deps: SaveRosterDeps, room: MembershipRoom, options: SaveRosterOptions = {}): void {
  const before = deps.store.get(room.code);
  deps.store.put(room);
  deps.hub.broadcastRoster(room.code);
  if (options.timerSnapshotSentByCaller !== true) broadcastTimerIfSeatViewChanged(deps, before, room);
}
