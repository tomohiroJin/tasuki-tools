/**
 * InMemoryRoomStore のテスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import type { Room } from "@tdd-mob/core";

function makeRoom(code: string): Room {
  return {
    code,
    createdAt: Date.now(),
    hostParticipantId: "host-001",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["Alice", "Bob"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0, 0],
      totalSwitches: 0,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "setup",
    participants: [],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
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
    const room2 = { ...room1, handoffNote: "updated" };
    store.put(room1);

    // When
    store.put(room2);

    // Then
    expect(store.get("ABCDE")?.handoffNote).toBe("updated");
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
