/**
 * ドライバー不在タイマーテスト
 * v2.2 Phase 2a R2-1: ドライバー不在の自動繰上
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { PresenceManager, DRIVER_ABSENCE_GRACE_MS } from "../src/application/presence.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

/** 稼働中のセッションを持つ room を返す（現ドライバー=Driver）。 */
function makeRunningRoom(code: string): Room {
  return {
    code,
    createdAt: 1000000,
    hostParticipantId: "driver-p01",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Driver", "Other"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["driver-p01", "other-p02"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0, 0],
      totalSwitches: 0,
    },
    clock: {
      running: true,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "session",
    participants: [
      {
        participantId: "driver-p01",
        connId: "d-conn",
        displayName: "Driver",
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000000,
      },
      {
        participantId: "other-p02",
        connId: "o-conn",
        displayName: "Other",
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

/**
 * @requirements v2.2 R2-1
 */
describe("PresenceManager: ドライバー不在の自動繰上", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let clock: FakeClock;
  let onDriverAbsence: ReturnType<typeof jest.fn>;
  let pm: PresenceManager;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    clock = new FakeClock(1000000);
    onDriverAbsence = jest.fn();
    pm = new PresenceManager({ store, broadcaster, clock, onDriverAbsence });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("現ドライバー切断後、猶予時間経過で当該ルームコードの不在通知が発火する", () => {
    // Given
    const room = makeRunningRoom("DTEST");
    store.put(room);

    // When
    pm.handleDisconnect("d-conn");
    // 直後はまだ発火しない
    expect(onDriverAbsence).not.toHaveBeenCalled();
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).toHaveBeenCalledWith(room.code);
  });

  it("猶予内に現ドライバーが復帰したら繰上しない", () => {
    // Given
    const room = makeRunningRoom("DTEST2");
    store.put(room);
    pm.handleDisconnect("d-conn");

    // When（猶予の半分経過 → 現ドライバー復帰 → さらに猶予経過）
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS / 2);
    pm.handlePing("d-conn");
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).not.toHaveBeenCalled();
  });

  it("現ドライバー以外の切断ではタイマーを張らない", () => {
    // Given
    const room = makeRunningRoom("DTEST3");
    store.put(room);

    // When
    pm.handleDisconnect("o-conn");
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).not.toHaveBeenCalled();
  });

  it("セッション非稼働(clock.running=false)では張らない", () => {
    // Given
    const room = makeRunningRoom("DTEST4");
    room.clock.running = false;
    store.put(room);

    // When
    pm.handleDisconnect("d-conn");
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).not.toHaveBeenCalled();
  });
});
