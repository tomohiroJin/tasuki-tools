/**
 * 名簿を保管し、ハブへ新しい名簿を配信する（#95 S5a・R3）。
 *
 * **名簿を書く経路は 3 つあった**（`handlers.ts` の `commit` / `presence.ts` の切断処理 /
 * `poker-handlers.ts`）。ハブへの配信をその 3 つに書き足す形にすると、**次に 4 つ目を
 * 足す人が配信を忘れる**。保管と配信を対にして、`store.put` を呼ぶ場所をここ 1 つに閉じる
 * （`test/save-roster.wiring.test.ts` が「他に呼ぶ場所が無いこと」を機械的に固定している）。
 *
 * **ツール側の配信はここでは行わない。** timer の snapshot も poker の round も、
 * それぞれの wire を組む場所が違う。ここが持つのは名簿だけである。
 */
import type { Room as MembershipRoom } from "@tasuki/room-core";
import type { RoomStore } from "../ports/room-store.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";

export interface SaveRosterDeps {
  store: RoomStore;
  hub: HubBroadcaster;
}

export function saveRoster(deps: SaveRosterDeps, room: MembershipRoom): void {
  deps.store.put(room);
  deps.hub.broadcastRoster(room.code);
}
