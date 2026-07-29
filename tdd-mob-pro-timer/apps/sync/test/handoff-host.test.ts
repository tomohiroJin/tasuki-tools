/**
 * ホスト委譲テスト
 * T048: FR-018, FR-020, SC-006
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PresenceManager, HOST_ABSENCE_GRACE_MS } from "../src/application/presence.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room } from "@tdd-mob/core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

function makeTestRoom(code: string): Room {
  return {
    code,
    createdAt: 1000000,
    hostParticipantId: "host-p01",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Host", "Editor"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["Host", "Editor"],
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
    participants: [
      {
        participantId: "host-p01",
        connId: "host-conn",
        displayName: "Host",
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000000,
      },
      {
        participantId: "editor-p02",
        connId: "editor-conn",
        displayName: "Editor",
        role: "editor",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000100,
      },
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

describe("PresenceManager: ホスト委譲（FR-018, SC-006）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let clock: FakeClock;
  let manager: PresenceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    clock = new FakeClock(1000000);
    manager = new PresenceManager({ store, broadcaster, clock });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ホスト切断後、猶予時間後にオンライン編集者へ委譲される（FR-018）", () => {
    const room = makeTestRoom("HTEST");
    store.put(room);

    // ホスト切断
    manager.handleDisconnect("host-conn");

    broadcaster.snapshots.length = 0;

    // 猶予時間経過
    vi.advanceTimersByTime(HOST_ABSENCE_GRACE_MS + 100);

    // 委譲されて snapshot が配信される
    expect(broadcaster.snapshots.length).toBeGreaterThan(0);

    const updatedRoom = store.get("HTEST");
    const newHost = updatedRoom?.participants.find((p) => p.role === "host");
    expect(newHost?.participantId).toBe("editor-p02");
  });

  it("ホストが猶予内に再接続すると委譲しない", () => {
    const room = makeTestRoom("HTEST2");
    store.put(room);

    manager.handleDisconnect("host-conn");

    // 猶予内に再接続（ping）
    const reconnected = {
      ...room,
      participants: room.participants.map((p) =>
        p.connId === "host-conn" ? { ...p, presence: "online" as const } : p,
      ),
    };
    store.put(reconnected);

    broadcaster.snapshots.length = 0;

    vi.advanceTimersByTime(HOST_ABSENCE_GRACE_MS + 100);

    // 委譲は起きない（hostParticipantId が変わっていない）
    const updatedRoom = store.get("HTEST2");
    expect(updatedRoom?.hostParticipantId).toBe("host-p01");
  });

  it("切断で presence が offline になり snapshot が配信される（FR-014）", () => {
    const room = makeTestRoom("HTEST3");
    store.put(room);

    manager.handleDisconnect("editor-conn");

    const updatedRoom = store.get("HTEST3");
    const editor = updatedRoom?.participants.find((p) => p.participantId === "editor-p02");
    expect(editor?.presence).toBe("offline");
    expect(broadcaster.snapshots.length).toBeGreaterThan(0);
  });
});
