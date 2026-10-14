/**
 * 接続からルームを引く問い合わせ（`room-lookup.ts`・#366 Task 3）の単体テスト。
 *
 * 以前は 7 か所に同じ走査が写されていた（hub・topic・roulette の `isInAnyRoom`、topic の `roomCodeOf`、
 * roulette の `roomOf`、timer の `findStateByConnId`、presence の `findRoomByConnId`）。
 */
import { describe, expect, it } from "bun:test";
import type { Participant, Room } from "@tasuki/room-core";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { findRoomByConnId, findRoomByToolConnection } from "../src/application/room-lookup.js";
import { TOOL_HUB, TOOL_ROULETTE, TOOL_TOPIC } from "../src/application/tool-id.js";

const person = (id: string, connections: [string, string | null][]): Participant => ({
  id,
  displayName: id,
  connections: new Map(connections),
  joinedAt: 0,
});

function storeWith(...rooms: Room[]): InMemoryRoomStore {
  const store = new InMemoryRoomStore();
  for (const room of rooms) store.put(room);
  return store;
}

const ROOM_A: Room = {
  code: "AAAAAA",
  createdAt: 0,
  participants: [person("p-1", [["c-topic", TOOL_TOPIC], ["c-hub", TOOL_HUB]])],
};
const ROOM_B: Room = {
  code: "BBBBBB",
  createdAt: 0,
  participants: [person("p-2", [["c-roulette", TOOL_ROULETTE]])],
};

describe("findRoomByConnId（ツールを問わない）", () => {
  it("Given 2 つのルーム / When 片方の参加者の接続で引く / Then そのルーム", () => {
    // Given
    const store = storeWith(ROOM_A, ROOM_B);
    // When
    const room = findRoomByConnId(store, "c-roulette");
    // Then
    expect(room?.code).toBe("BBBBBB");
  });

  it("Given ハブとして在席している接続 / When 引く / Then そのルーム（ツールを問わない）", () => {
    // Given
    const store = storeWith(ROOM_A, ROOM_B);
    // When
    const room = findRoomByConnId(store, "c-hub");
    // Then
    expect(room?.code).toBe("AAAAAA");
  });

  it("Given どこにも居ない接続 / When 引く / Then undefined", () => {
    // Given
    const store = storeWith(ROOM_A, ROOM_B);
    // When
    const room = findRoomByConnId(store, "c-nobody");
    // Then
    expect(room).toBeUndefined();
  });
});

describe("findRoomByToolConnection（ツールで絞る）", () => {
  it("Given topic として在席している接続 / When topic で引く / Then そのルーム", () => {
    // Given
    const store = storeWith(ROOM_A, ROOM_B);
    // When
    const room = findRoomByToolConnection(store, "c-topic", TOOL_TOPIC);
    // Then
    expect(room?.code).toBe("AAAAAA");
  });

  it("Given ハブとして在席している接続 / When topic で引く / Then undefined（別のツールの接続は引かない。spec T4・R11 の 2 段目）", () => {
    // Given
    const store = storeWith(ROOM_A, ROOM_B);
    // When
    const room = findRoomByToolConnection(store, "c-hub", TOOL_TOPIC);
    // Then
    expect(room).toBeUndefined();
  });

  it("Given roulette として在席している接続 / When topic で引く / Then undefined", () => {
    // Given
    const store = storeWith(ROOM_A, ROOM_B);
    // When
    const room = findRoomByToolConnection(store, "c-roulette", TOOL_TOPIC);
    // Then
    expect(room).toBeUndefined();
  });
});
