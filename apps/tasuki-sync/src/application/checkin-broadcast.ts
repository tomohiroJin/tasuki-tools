/**
 * チェックインの状態を配る（#406）。
 *
 * **受け手ごとに中身が違う投影を、接続 1 本ずつへ送る。** 匿名は「サーバーが送らない」ことで守る
 * （設計 §6）ので、全員へ同じフレームを送る口は作らない（`ports/checkin-server-msg.ts`）。
 * 宛先は**チェックインの接続だけ**で、呼び出し時点の名簿から決まる。**保管のあとに呼ぶ**。
 */
import { isPresentIn, type Room } from "@tasuki/room-core";
import { INITIAL_CHECKIN_STATE, toView, type SeatInput } from "@tasuki/checkin-core";
import type { CheckinServerMsg } from "../ports/checkin-server-msg.js";
import type { CheckinStore } from "../ports/checkin-store.js";
import type { RoomStore } from "../ports/room-store.js";
import { TOOL_CHECKIN } from "./tool-id.js";

export interface CheckinBroadcasterDeps {
  store: Pick<RoomStore, "get">;
  checkins: CheckinStore;
  send: (connId: string, msg: CheckinServerMsg) => void;
}

export interface CheckinBroadcaster {
  /** そのルームのチェックインの接続 1 本ずつへ、その接続の参加者に向けた投影を送る */
  publish(roomCode: string): void;
  /** 参加・復帰した 1 本の接続へ、いまの状態を送る（無ければ既定の状態を置いてから送る） */
  sendCurrent(connId: string, roomCode: string): void;
}

/** 席の入力。名簿の並びのまま。`present` は**この道具に**在席しているか（ハブだけに居る人は数えない・判断 10） */
export function seatsOf(room: Room): SeatInput[] {
  return room.participants.map((p) => ({ id: p.id, name: p.displayName, present: isPresentIn(p, TOOL_CHECKIN) }));
}

export function makeCheckinBroadcaster(deps: CheckinBroadcasterDeps): CheckinBroadcaster {
  return {
    publish(roomCode) {
      const room = deps.store.get(roomCode);
      const state = deps.checkins.get(roomCode);
      if (room === undefined || state === undefined) return; // ルームが消えた・まだ誰も開いていない
      const seats = seatsOf(room);
      for (const p of room.participants) {
        for (const [connId, tool] of p.connections) {
          if (tool !== TOOL_CHECKIN) continue;
          deps.send(connId, { type: "checkin", state: toView(state, p.id, seats) });
        }
      }
    },
    sendCurrent(connId, roomCode) {
      // ルームが消えていたら状態を置かない（破棄の後始末が済んだルームに状態だけが残る）。
      const room = deps.store.get(roomCode);
      if (room === undefined) return;
      const owner = room.participants.find((p) => p.connections.has(connId));
      if (owner === undefined) return;
      let state = deps.checkins.get(roomCode);
      if (state === undefined) {
        state = INITIAL_CHECKIN_STATE;
        deps.checkins.put(roomCode, state);
      }
      deps.send(connId, { type: "checkin", state: toView(state, owner.id, seatsOf(room)) });
    },
  };
}
