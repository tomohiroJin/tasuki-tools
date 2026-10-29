/**
 * timer とハブの配信のアダプタ（`adapters/timer-ws-broadcaster.ts`・#367 Task 5）の単体テスト。
 *
 * 以前は組み立て（`create-sync-server.ts`）の中のオブジェクトリテラルで、宛先の選び方 3 つも同じ所にあった。
 * 宛先は**呼び出し時点の名簿**から決まる（保管より先に配信すると 1 つ前の名簿になる）。
 */
import { describe, expect, it } from "bun:test";
import type { HubServerMsg, Room as MembershipRoom } from "@tasuki/room-core";
import type { Room, ServerMsg } from "@tasuki/timer-core";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { createTimerWsBroadcaster, type TimerWsOutbound } from "../src/adapters/timer-ws-broadcaster.js";
import { TOOL_HUB, TOOL_ROULETTE, TOOL_TIMER, TOOL_TOPIC } from "../src/application/tool-id.js";

const ROOM: MembershipRoom = {
  code: "ROOM-A",
  createdAt: 0,
  participants: [
    {
      id: "p-1",
      displayName: "あおい",
      connections: new Map<string, string | null>([
        ["c-timer", TOOL_TIMER],
        ["c-hub", TOOL_HUB],
        ["c-roulette", TOOL_ROULETTE],
        ["c-topic", TOOL_TOPIC],
      ]),
      joinedAt: 0,
    },
  ],
};

function setup() {
  const store = new InMemoryRoomStore();
  store.put(ROOM);
  const sent: { kind: string; to: string[]; msg: ServerMsg | HubServerMsg }[] = [];
  const ws: TimerWsOutbound = {
    send: (connId, msg) => sent.push({ kind: "send", to: [connId], msg }),
    broadcast: (connIds, msg) => sent.push({ kind: "broadcast", to: connIds, msg }),
    sendHub: (connId, msg) => sent.push({ kind: "sendHub", to: [connId], msg }),
    broadcastHub: (connIds, msg) => sent.push({ kind: "broadcastHub", to: connIds, msg }),
  };
  const rosterChanged: string[] = [];
  return {
    store,
    sent,
    rosterChanged,
    ...createTimerWsBroadcaster({ store, ws: () => ws, onRosterBroadcast: (code) => rosterChanged.push(code) }),
  };
}

describe("timer の配信", () => {
  it("Given 4 つのツールの接続 / When snapshot を配る / Then timer の接続だけへ送る", () => {
    // Given
    const h = setup();
    // When
    h.broadcaster.broadcastSnapshot("ROOM-A", {} as Room);
    // Then
    expect(h.sent).toEqual([{ kind: "broadcast", to: ["c-timer"], msg: { type: "snapshot", room: {} as Room } }]);
  });

  it("Given 名簿に無いルーム / When signal を配る / Then 宛先は空", () => {
    // Given
    const h = setup();
    const msg = { type: "signal", signal: "switch", nextDriverName: "" } as ServerMsg;
    // When
    h.broadcaster.broadcastSignal("NOPE", msg);
    // Then
    expect(h.sent).toEqual([{ kind: "broadcast", to: [], msg }]);
  });
});

describe("ハブの配信", () => {
  it("Given 4 つのツールの接続 / When 名簿を配る / Then ハブとルーレットの接続へ送る（#94・spec R14）", () => {
    // Given
    const h = setup();
    // When
    h.hubBroadcaster.broadcastRoster("ROOM-A");
    // Then
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ kind: "broadcastHub", to: ["c-hub", "c-roulette"], msg: { type: "roster" } });
  });

  it("Given 名簿に無いルーム / When 名簿を配る / Then 何も送らず、名簿の変化も知らせない", () => {
    // Given
    const h = setup();
    // When
    h.hubBroadcaster.broadcastRoster("NOPE");
    // Then
    expect(h.sent).toEqual([]);
    expect(h.rosterChanged).toEqual([]);
  });

  it("Given 名簿にあるルーム / When 名簿を配る / Then 配ったあとにそのルームの名簿の変化を知らせる（#406）", () => {
    // Given
    const h = setup();
    // When
    h.hubBroadcaster.broadcastRoster("ROOM-A");
    // Then
    expect(h.rosterChanged).toEqual(["ROOM-A"]);
  });
});
