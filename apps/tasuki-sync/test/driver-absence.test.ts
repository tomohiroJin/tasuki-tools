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
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000000,
      },
      {
        participantId: "other-p02",
        connId: "o-conn",
        displayName: "Other",
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

/**
 * 切断そのものの副作用（プレゼンス更新と snapshot 配信）。
 *
 * 元は `handoff-host.test.ts`（ホスト不在の自動委譲）に同居していたが、
 * #95 S3 でホストの概念ごと委譲を廃止した際、この 1 件だけは役割と無関係な
 * `handleDisconnect` の性質として残るためここへ引き取った。
 *
 * @requirements FR-014
 */
describe("PresenceManager: 切断時のプレゼンス更新", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let pm: PresenceManager;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    pm = new PresenceManager({ store, broadcaster, clock: new FakeClock(1000000) });
  });

  it("切断で presence が offline になり snapshot が配信される", () => {
    // Given
    const room = makeRunningRoom("DTEST5");
    store.put(room);

    // When（現ドライバーではない参加者を切断させる）
    pm.handleDisconnect("o-conn");

    // Then
    const updatedRoom = store.get("DTEST5");
    const other = updatedRoom?.participants.find((p) => p.participantId === "other-p02");
    expect(other?.presence).toBe("offline");
    expect(broadcaster.snapshots.length).toBeGreaterThan(0);
  });
});
