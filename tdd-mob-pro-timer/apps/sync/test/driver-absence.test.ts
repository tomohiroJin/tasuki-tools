/**
 * ドライバー不在タイマーテスト
 * v2.2 Phase 2a R2-1: ドライバー不在の自動繰上
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PresenceManager, DRIVER_ABSENCE_GRACE_MS } from "../src/application/presence.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room, ServerMsg } from "@tdd-mob/core";
import type { Broadcaster } from "../src/ports/broadcaster.js";

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
      rotation: ["Driver", "Other"],
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

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: string[] = [];
  readonly signals: string[] = [];
  broadcastSnapshot(code: string): void { this.snapshots.push(code); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(code: string): void { this.signals.push(code); }
}

describe("PresenceManager: ドライバー不在の自動繰上（v2.2 R2-1）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let clock: FakeClock;
  let onDriverAbsence: ReturnType<typeof vi.fn>;
  let pm: PresenceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    clock = new FakeClock(1000000);
    onDriverAbsence = vi.fn();
    pm = new PresenceManager({ store, broadcaster, clock, onDriverAbsence });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("現ドライバー切断後、猶予時間経過で onDriverAbsence(code) が呼ばれる", () => {
    const room = makeRunningRoom("DTEST");
    store.put(room);

    pm.handleDisconnect("d-conn");

    // 直後はまだ呼ばれない
    expect(onDriverAbsence).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    expect(onDriverAbsence).toHaveBeenCalledWith(room.code);
  });

  it("猶予内に現ドライバーが復帰したら繰上しない", () => {
    const room = makeRunningRoom("DTEST2");
    store.put(room);

    pm.handleDisconnect("d-conn");

    // 猶予の半分経過 → 現ドライバー復帰
    vi.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS / 2);
    pm.handlePing("d-conn");

    // さらに猶予経過しても呼ばれない
    vi.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    expect(onDriverAbsence).not.toHaveBeenCalled();
  });

  it("現ドライバー以外の切断ではタイマーを張らない", () => {
    const room = makeRunningRoom("DTEST3");
    store.put(room);

    pm.handleDisconnect("o-conn");

    vi.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    expect(onDriverAbsence).not.toHaveBeenCalled();
  });

  it("セッション非稼働(clock.running=false)では張らない", () => {
    const room = makeRunningRoom("DTEST4");
    room.clock.running = false;
    store.put(room);

    pm.handleDisconnect("d-conn");

    vi.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    expect(onDriverAbsence).not.toHaveBeenCalled();
  });
});
