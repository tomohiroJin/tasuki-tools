/**
 * 進行タイマーの状態を配る（#429）。`roulette-broadcast.ts` と同じ形。
 *
 * 宛先は**進行タイマーの接続だけ**。宛先は**呼び出し時点の名簿**から決まるので、**保管のあとに呼ぶ**。
 * **経過は送る時点で計る**（`toView` に単調時計の現在値を渡す。単調時計の値そのものは載せない）。
 */
import { connectionsIn } from "@tasuki/room-core";
import { INITIAL_AGENDA_STATE, toView, type AgendaState } from "@tasuki/agenda-core";
import type { AgendaServerMsg } from "../ports/agenda-server-msg.js";
import type { AgendaStore } from "../ports/agenda-store.js";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { RoomStore } from "../ports/room-store.js";
import { TOOL_AGENDA } from "./tool-id.js";

export interface AgendaBroadcasterDeps {
  store: Pick<RoomStore, "get">;
  agendas: AgendaStore;
  clock: MonotonicClock;
  send: (connIds: string[], msg: AgendaServerMsg) => void;
}

export interface AgendaBroadcaster {
  /** そのルームの進行タイマーの接続すべてへ、いまの状態を 1 通ずつ送る */
  publish(roomCode: string): void;
  /** 参加・復帰した 1 本の接続へ、いまの状態を送る（無ければ既定の状態を置いてから送る） */
  sendCurrent(connId: string, roomCode: string): void;
}

export function makeAgendaBroadcaster(deps: AgendaBroadcasterDeps): AgendaBroadcaster {
  /** 送る時点の経過で写しを作る。`AgendaView.steps` は readonly、wire の型は可変なので配列だけ複製する。 */
  const frameOf = (state: AgendaState): AgendaServerMsg => {
    const view = toView(state, deps.clock.now());
    return { type: "agenda", state: { ...view, steps: [...view.steps] } };
  };

  const stateOf = (roomCode: string): AgendaState => {
    const current = deps.agendas.get(roomCode);
    if (current !== undefined) return current;
    deps.agendas.put(roomCode, INITIAL_AGENDA_STATE);
    return INITIAL_AGENDA_STATE;
  };

  return {
    publish(roomCode) {
      const room = deps.store.get(roomCode);
      const state = deps.agendas.get(roomCode);
      if (room === undefined || state === undefined) return; // ルームが消えた・まだ誰も開いていない
      deps.send(connectionsIn(room, TOOL_AGENDA), frameOf(state));
    },
    sendCurrent(connId, roomCode) {
      // ルームが消えていたら状態を置かない（置くと、破棄の後始末が済んだルームに状態だけが残る）。
      if (deps.store.get(roomCode) === undefined) return;
      deps.send([connId], frameOf(stateOf(roomCode)));
    },
  };
}
