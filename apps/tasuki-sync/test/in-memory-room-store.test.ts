/**
 * InMemoryRoomStore のテスト
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import type { Room } from "@tasuki/room-core";

/**
 * 名簿の最小ルーム（#95 S4a）。
 *
 * このストアが保管するのは**名簿だけ**になった（timer の状態は `InMemoryTimerStore`）。
 * ここは保管の振る舞い（put/get/remove/list）を見るテストなので、名簿そのものを置く。
 */
function makeRoom(code: string): Room {
  return {
    code,
    createdAt: 0,
    participants: [
      { id: "p0", displayName: "Alice", connId: "c0", presence: "online", joinedAt: 0 },
      { id: "p1", displayName: "Bob", connId: null, presence: "offline", joinedAt: 1 },
    ],
  };
}

/**
 * @requirements FR-013
 */
describe("InMemoryRoomStore", () => {
  let store: InMemoryRoomStore;

  beforeEach(() => {
    store = new InMemoryRoomStore();
  });

  it("存在しないコードは undefined を返す", () => {
    expect(store.get("NOTEXIST")).toBeUndefined();
  });

  it("put した後に get できる", () => {
    // Given
    const room = makeRoom("ABCDE");

    // When
    store.put(room);

    // Then
    expect(store.get("ABCDE")).toEqual(room);
  });

  it("put で既存ルームを上書きできる", () => {
    // Given
    const room1 = makeRoom("ABCDE");
    const room2 = { ...room1, participants: [] };
    store.put(room1);

    // When
    store.put(room2);

    // Then
    expect(store.get("ABCDE")?.participants).toEqual([]);
  });

  it("remove でルームを削除できる", () => {
    // Given
    const room = makeRoom("ABCDE");
    store.put(room);

    // When
    store.remove("ABCDE");

    // Then
    expect(store.get("ABCDE")).toBeUndefined();
  });

  it("list で全ルームを取得できる", () => {
    // Given
    store.put(makeRoom("ROOM1"));
    store.put(makeRoom("ROOM2"));

    // When
    const rooms = store.list();

    // Then
    expect(rooms).toHaveLength(2);
  });

  it("list は空の場合に空配列を返す", () => {
    expect(store.list()).toHaveLength(0);
  });
});
