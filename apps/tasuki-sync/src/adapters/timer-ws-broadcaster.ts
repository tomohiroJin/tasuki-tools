/**
 * timer とハブ（選択画面）の配信のアダプタ（#367 で `create-sync-server.ts` から出した。中身は変えていない）。
 *
 * ポート（`Broadcaster`・`HubBroadcaster`）を、WS アダプタの送る口（{@link TimerWsOutbound}）へ橋渡しする。
 * 宛先は**呼び出し時点の名簿（`store`）**から、そのツールとして在席している接続を選ぶ。
 * poker の配信は `poker-ws-broadcaster.ts`。
 */
import { connectionsIn, type HubServerMsg } from "@tasuki/room-core";
import type { Room, ServerMsg } from "@tasuki/timer-core";
import { buildRoster } from "../application/roster-dto.js";
import { TOOL_ROULETTE, TOOL_TIMER } from "../application/tool-id.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";

/** WS アダプタの送る口のうち、timer とハブの配信が使うもの。 */
export interface TimerWsOutbound {
  send(connId: string, msg: ServerMsg): void;
  broadcast(connIds: string[], msg: ServerMsg): void;
  sendHub(connId: string, msg: HubServerMsg): void;
  broadcastHub(connIds: string[], msg: HubServerMsg): void;
}

export interface TimerWsBroadcasterDeps {
  store: Pick<RoomStore, "get">;
  /**
   * 送る口を**呼ぶたびに引く**。WS アダプタはハンドラを受け、ハンドラはこの配信を受けるので、組み立ての中で
   * 循環する。組み立ては WS アダプタを後で代入する（`create-sync-server.ts` の前方参照）。
   */
  ws: () => TimerWsOutbound;
  /**
   * 名簿を配ったあとに呼ぶ（#406）。名簿は `saveRoster` の 1 経路でしか書かれず、その最後に必ず
   * `broadcastRoster` が呼ばれる（`test/save-roster.wiring.test.ts`）ので、ここに口を置けば参加・切断・
   * 退出・ハブへの移動のすべてで「名簿が変わった」を拾える。チェックインが席と自動開票を測り直す。
   * 前方参照で渡される（ハンドラは配信を受け、配信はハンドラを呼ぶため）。
   */
  onRosterBroadcast: (roomCode: string) => void;
}

export function createTimerWsBroadcaster(deps: TimerWsBroadcasterDeps): {
  broadcaster: Broadcaster;
  hubBroadcaster: HubBroadcaster;
} {
  /**
   * 配信先は**名簿（`store`）を引いて、timer に在席している接続だけ**へ絞る
   * （#95 S4b・D4・`connectionsIn`）。
   *
   * ⚠ **宛先は「呼び出し時点のストア」から決まる。** 2 つの帰結がある ——
   *
   * 1. **保管より先に配信すると、宛先が 1 つ前の名簿になる。** `commit`（`handlers.ts`）と
   *    `presence.ts` はどちらも put のあとに配信する。この順序に依存している例が
   *    `participant-remove.ts` にあり、退出させた本人へ全体配信が届かないことを
   *    この順序で担保している（本人向けは専用の `sendTo`）
   * 2. **S4a まで `broadcastSnapshot` は引数の wire から `connId` を拾っていた。**
   *    多接続では wire に接続 1 本を載せられないので、名簿を引く `broadcastSignal` と
   *    同じ形へ揃えた（wire から `connId` が消えるのはこの帰結である）
   */
  const recipientsOf = (roomCode: string): string[] => {
    const room = deps.store.get(roomCode);
    return room ? connectionsIn(room, TOOL_TIMER) : [];
  };

  /**
   * ハブ（選択画面）の配信先（#95 S5a）。**ツールを宣言していない接続**である。
   *
   * timer 側（{@link recipientsOf}）と同じく、宛先は**呼び出し時点のストア**から決まる。
   * 中身（名簿）も同じ時点から引くので、保管より先に配信して 1 つ前の名簿を配る事故は
   * `saveRoster`（保管と配信を対にする）と合わせて塞いである。
   */
  const hubRecipientsOf = (roomCode: string): string[] => {
    const room = deps.store.get(roomCode);
    return room ? connectionsIn(room, null) : [];
  };

  /**
   * 名簿（`roster`）の配信先（#94・spec R14）。**ハブ ＋ ルーレット**である。
   *
   * ルーレットは「いまルームに居る人」を描くので名簿を受け取る。`hubRecipientsOf` を直接広げず
   * 名前で分けてある（`hubRecipientsOf` の意味は「ハブ」のまま残す）。名簿の配信は `saveRoster`
   * に 1 本化されている（`test/save-roster.wiring.test.ts`）ので、宛先を足すだけで接続の着脱・退出の
   * すべてが届く。
   */
  const rosterRecipientsOf = (roomCode: string): string[] => {
    const room = deps.store.get(roomCode);
    return room ? [...hubRecipientsOf(roomCode), ...connectionsIn(room, TOOL_ROULETTE)] : [];
  };

  const hubBroadcaster: HubBroadcaster = {
    sendTo(connId: string, msg: HubServerMsg): void {
      deps.ws().sendHub(connId, msg);
    },
    broadcastRoster(roomCode: string): void {
      const room = deps.store.get(roomCode);
      if (!room) return;
      deps.ws().broadcastHub(rosterRecipientsOf(roomCode), {
        type: "roster",
        room: buildRoster(room),
      });
      deps.onRosterBroadcast(roomCode);
    },
  };

  const broadcaster: Broadcaster = {
    broadcastSnapshot(roomCode: string, room: Room): void {
      deps.ws().broadcast(recipientsOf(roomCode), { type: "snapshot", room });
    },
    sendTo(connId: string, msg: ServerMsg): void {
      deps.ws().send(connId, msg);
    },
    broadcastSignal(roomCode: string, msg: ServerMsg): void {
      deps.ws().broadcast(recipientsOf(roomCode), msg);
    },
  };

  return { broadcaster, hubBroadcaster };
}
