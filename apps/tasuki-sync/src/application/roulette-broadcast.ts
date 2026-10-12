/**
 * ルーレットの状態を配る（#94 spec §5.2）。
 *
 * 宛先は**ルーレットの接続だけ**（ハブ・timer・poker・お題には配らない。読む画面が無い）。
 * 宛先は**呼び出し時点の名簿**から決まるので、**保管のあとに呼ぶ**（`topic-broadcast.ts` と同じ）。
 *
 * **`elapsedMs` は送る時点で計る**（spec R5）。`toView` に単調時計の現在値を渡す。
 */
import { connectionsIn } from "@tasuki/room-core";
import { INITIAL_ROULETTE_STATE, toView, type RouletteState } from "@tasuki/roulette-core";
import type { MonotonicClock } from "../ports/poker-monotonic-clock.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RouletteServerMsg } from "../ports/roulette-server-msg.js";
import type { RouletteStore } from "../ports/roulette-store.js";
import { TOOL_ROULETTE } from "./tool-id.js";

export interface RouletteBroadcasterDeps {
  store: Pick<RoomStore, "get">;
  roulettes: RouletteStore;
  clock: MonotonicClock;
  send: (connIds: string[], msg: RouletteServerMsg) => void;
}

export interface RouletteBroadcaster {
  /** そのルームのルーレットの接続すべてへ、いまの状態を 1 通ずつ送る */
  publish(roomCode: string): void;
  /** 参加・復帰した 1 本の接続へ、いまの状態を送る（無ければ既定の状態を置いてから送る） */
  sendCurrent(connId: string, roomCode: string): void;
}

export function makeRouletteBroadcaster(deps: RouletteBroadcasterDeps): RouletteBroadcaster {
  const stateOf = (roomCode: string): RouletteState => {
    const current = deps.roulettes.get(roomCode);
    if (current !== undefined) return current;
    deps.roulettes.put(roomCode, INITIAL_ROULETTE_STATE);
    return INITIAL_ROULETTE_STATE;
  };

  return {
    publish(roomCode) {
      const room = deps.store.get(roomCode);
      const state = deps.roulettes.get(roomCode);
      if (room === undefined || state === undefined) return; // ルームが消えた・まだ誰も開いていない
      deps.send(connectionsIn(room, TOOL_ROULETTE), { type: "roulette", state: toView(state, deps.clock.now()) });
    },
    sendCurrent(connId, roomCode) {
      // ルームが消えていたら状態を置かない（置くと、破棄の後始末が済んだルームに状態だけが残る）。
      if (deps.store.get(roomCode) === undefined) return;
      deps.send([connId], { type: "roulette", state: toView(stateOf(roomCode), deps.clock.now()) });
    },
  };
}
