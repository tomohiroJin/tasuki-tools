/**
 * ドライバー不在タイマーテスト
 * v2.2 Phase 2a R2-1: ドライバー不在の自動繰上
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { PresenceManager, DRIVER_ABSENCE_GRACE_MS } from "../src/application/presence.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room } from "@tasuki/timer-core";
import { attachConnection } from "@tasuki/room-core";
import { TOOL_TIMER } from "../src/application/tool-id.js";
import { putRoomView, maybeRoomViewOf } from "./support/room-view.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { spyHub } from "./support/hub.js";

/**
 * 前提の接続 ID（#95 S4b）。**wire は `connId` を持たなくなった**ので、どの参加者が
 * どの接続を持つかは `putRoomView` の第 4 引数で明示する（このテストは `d-conn` /
 * `o-conn` からの切断・ping を送るため、綴りが一致していなければならない）。
 */
const CONNS = { "driver-p01": ["d-conn"], "other-p02": ["o-conn"] } as const;

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
        displayName: "Driver",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000000,
      },
      {
        participantId: "other-p02",
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
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let clock: FakeClock;
  let onDriverAbsence: ReturnType<typeof jest.fn>;
  let pm: PresenceManager;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    clock = new FakeClock(1000000);
    onDriverAbsence = jest.fn();
    pm = new PresenceManager({ store, timers, broadcaster, hub: spyHub(), clock, onDriverAbsence });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * 現ドライバーが新しい接続で戻ってきた状態を名簿へ作る。
   *
   * 本番では `room.join`（resumeToken つき）が `attachConnection` を呼ぶ。ここは
   * `PresenceManager` 単体のテストなのでハンドラを通さず、同じ関数で名簿を進める。
   */
  function reviveDriver(connId: string, tool: string | null = TOOL_TIMER): void {
    const membership = store.get(store.list()[0]!.code)!;
    store.put(attachConnection(membership, "driver-p01", connId, tool));
  }

  it("現ドライバー切断後、猶予時間経過で当該ルームコードの不在通知が発火する", () => {
    // Given
    const room = makeRunningRoom("DTEST");
    putRoomView(store, timers, room, CONNS);

    // When
    pm.handleDisconnect("d-conn");
    // 直後はまだ発火しない
    expect(onDriverAbsence).not.toHaveBeenCalled();
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).toHaveBeenCalledWith(room.code);
  });

  // ⚠ **復帰の演じ方が #95 S4b で変わった。** S4a までは切断で `presence` だけが
  // `offline` になり `connId` が残っていたので、同じ接続からの ping が復帰を表せた。
  // いま切断はその接続を名簿から外すので、**同じ接続 ID からの ping はもう届かない**
  // （実際に閉じたソケットなので本番でも届かない）。復帰の実体は
  // 「新しい接続で resumeToken つきの `room.join` が来る」ことであり、
  // ここではその結果（名簿に新しい接続が足される）を作ってから ping を送る。
  it("猶予内に現ドライバーが新しい接続で復帰したら繰上しない（ping で解除）", () => {
    // Given: 現ドライバーが切断し、猶予タイマーが張られている
    const room = makeRunningRoom("DTEST2");
    putRoomView(store, timers, room, CONNS);
    pm.handleDisconnect("d-conn");

    // When（猶予の半分経過 → 新しい接続で復帰 → その接続から ping → さらに猶予経過）
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS / 2);
    reviveDriver("d-conn-2");
    pm.handlePing("d-conn-2");
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).not.toHaveBeenCalled();
  });

  // ping が来なくても発火時の stale-check が守る（2 段目の網）。**在席で判定する**ので、
  // ハブのタブだけを開いて戻ってきた人はここで「居ない」と扱われる（D21）。
  it("ping が無くても、発火時に timer へ在席していれば繰上しない", () => {
    // Given
    const room = makeRunningRoom("DTEST2b");
    putRoomView(store, timers, room, CONNS);
    pm.handleDisconnect("d-conn");

    // When: ping を送らずに復帰だけして猶予を過ごす
    reviveDriver("d-conn-2");
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).not.toHaveBeenCalled();
  });

  it("選択画面のタブだけで戻ってきた場合は繰上する（timer に在席していない・D21）", () => {
    // Given
    const room = makeRunningRoom("DTEST2c");
    putRoomView(store, timers, room, CONNS);
    pm.handleDisconnect("d-conn");

    // When: ツールを宣言しない接続（ハブ）で戻る。presence は online に戻るが、
    // タイマーの前には誰も居ない
    reviveDriver("hub-conn", null);
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    expect(onDriverAbsence).toHaveBeenCalledWith(room.code);
  });

  it("現ドライバー以外の切断ではタイマーを張らない", () => {
    // Given
    const room = makeRunningRoom("DTEST3");
    putRoomView(store, timers, room, CONNS);

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
    putRoomView(store, timers, room, CONNS);

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
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let pm: PresenceManager;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    pm = new PresenceManager({ store, timers, broadcaster, hub: spyHub(), clock: new FakeClock(1000000) });
  });

  it("切断で presence が offline になり snapshot が配信される", () => {
    // Given
    const room = makeRunningRoom("DTEST5");
    putRoomView(store, timers, room, CONNS);

    // When（現ドライバーではない参加者を切断させる）
    pm.handleDisconnect("o-conn");

    // Then
    const updatedRoom = maybeRoomViewOf(store, timers, "DTEST5");
    const other = updatedRoom?.participants.find((p) => p.participantId === "other-p02");
    expect(other?.presence).toBe("offline");
    expect(broadcaster.snapshots.length).toBeGreaterThan(0);
  });
});
