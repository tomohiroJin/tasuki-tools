/**
 * 代表生成・タイムアウト・再委譲のテスト
 *
 * 候補列 = host → editor+ かつ hasAiKey の online を joinedAt 昇順 → 末尾に fallback。
 * 先頭へ need-problem を送り、deadline 内に submit 無ければ次候補、
 * 全候補失敗で pickFallback 確定。リロール（新 request）で旧依頼をキャンセル。
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import {
  ProblemDelegator,
  PROBLEM_DEADLINE_MS,
} from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, Problem } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { testLogger, testRefEncoder } from "./support/test-logger.js";

const validProblem: Problem = {
  title: "FizzBuzz",
  description: "1からNまで…",
  requirements: ["3の倍数はFizz"],
  exampleTest: "expect(fizzBuzz(3)).toBe('Fizz')",
  hints: [],
};

function makeRoom(overrides?: Partial<Room>): Room {
  return {
    code: "PD01",
    createdAt: 1000000,
    hostParticipantId: "host",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["A", "B"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["A", "B"],
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
    phase: "ready",
    participants: [
      {
        participantId: "host",
        connId: "host-conn",
        displayName: "Host",
        role: "host",
        presence: "online",
        hasAiKey: true,
        joinedAt: 1000000,
      },
      {
        participantId: "ed1",
        connId: "ed1-conn",
        displayName: "Ed1",
        role: "editor",
        presence: "online",
        hasAiKey: true,
        joinedAt: 1000100,
      },
      {
        participantId: "ed2",
        connId: "ed2-conn",
        displayName: "Ed2",
        role: "editor",
        presence: "online",
        hasAiKey: true,
        joinedAt: 1000200,
      },
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    ...overrides,
  };
}

/** need-problem シグナルの送信先 connId を取り出す */
function needProblemTargets(b: SpyBroadcaster): string[] {
  return b.sent
    .filter((s) => s.msg.type === "signal" && s.msg.signal === "need-problem")
    .map((s) => s.connId);
}

/**
 * @requirements FR-023, FR-024, FR-025, FR-026, FR-027, US3
 */
describe("ProblemDelegator: 代表生成", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let delegator: ProblemDelegator;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    delegator = new ProblemDelegator({ store, clock, broadcaster, logger: testLogger, refEncoder: testRefEncoder });
  });

  afterEach(() => {
    delegator.cancelAll();
    jest.useRealTimers();
  });

  it("request で先頭候補（host）へ need-problem を送る", () => {
    // Given
    store.put(makeRoom());

    // When
    delegator.request("PD01", "req-1");

    // Then
    const targets = needProblemTargets(broadcaster);
    expect(targets[0]).toBe("host-conn");
  });

  it("候補が valid な problem を submit すると Room.problem に確定する", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");

    // When
    delegator.submit("PD01", "req-1", "host", validProblem, false);

    // Then
    const room = store.get("PD01");
    expect(room?.problem?.title).toBe("FizzBuzz");
  });

  it("submit 後に snapshot が配信される", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");
    broadcaster.snapshots.length = 0;

    // When
    delegator.submit("PD01", "req-1", "host", validProblem, false);

    // Then
    expect(broadcaster.snapshots.some((s) => s.roomCode === "PD01")).toBe(true);
  });

  it("deadline 超過で次候補（ed1）へ再委譲する", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");

    // When
    jest.advanceTimersByTime(PROBLEM_DEADLINE_MS + 100);

    // Then
    const targets = needProblemTargets(broadcaster);
    expect(targets).toEqual(["host-conn", "ed1-conn"]);
  });

  it("全候補が deadline 超過すると定型お題で確定する", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");

    // When（host → ed1 → ed2 の 3 候補ぶん deadline を経過）
    jest.advanceTimersByTime((PROBLEM_DEADLINE_MS + 100) * 3);

    // Then
    const room = store.get("PD01");
    expect(room?.problem).not.toBeNull();
    expect(room?.problem?.title).toBeTruthy();
  });

  it("AI鍵保有者が一人もいなければ即座に定型へ確定する", () => {
    // Given
    const room = makeRoom();
    room.participants = room.participants.map((p) => ({ ...p, hasAiKey: false }));
    store.put(room);

    // When
    delegator.request("PD01", "req-1");

    // Then
    expect(needProblemTargets(broadcaster)).toHaveLength(0); // need-problem は誰にも送られない
    expect(store.get("PD01")?.problem).not.toBeNull(); // 定型が即確定
  });

  it("不正な problem の submit は定型へ縮退する", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");

    // When（不正な構造＝title 欠落を submit）
    delegator.submit("PD01", "req-1", "host", { foo: "bar" } as never, false);

    // Then（縮退した定型お題（FizzBuzz 等）が入る）
    const room = store.get("PD01");
    expect(room?.problem).not.toBeNull();
    expect(room?.problem?.title).toBeTruthy();
  });

  it("リロール（新 request）で旧依頼の submit はキャンセルされる", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");
    delegator.request("PD01", "req-2"); // リロール

    // When（旧 requestId で submit する）
    const accepted = delegator.submit("PD01", "req-1", "host", validProblem, false);

    // Then（無視される）
    expect(accepted).toBe(false);
  });

  it("現候補でない参加者の submit は拒否される", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");

    // When（先頭候補は host。ed2 が割り込んで submit する）
    const accepted = delegator.submit("PD01", "req-1", "ed2", validProblem, false);

    // Then
    expect(accepted).toBe(false);
  });

  it("リロード後、旧依頼の deadline 発火は新依頼の候補列を進めない（防御）", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1"); // host へオファー（旧タイマー）
    delegator.request("PD01", "req-2"); // リロード：cancel で旧タイマー解除、host へ再オファー
    broadcaster.sent.length = 0;

    // When（旧タイマーが万一残っていても新依頼を進めないはず）
    jest.advanceTimersByTime(PROBLEM_DEADLINE_MS - 1);

    // Then（host のままで ed1 へは進まない）
    expect(needProblemTargets(broadcaster)).toHaveLength(0);
  });

  it("候補が submit したら deadline タイマーは解除され次候補へ進まない", () => {
    // Given
    store.put(makeRoom());
    delegator.request("PD01", "req-1");
    delegator.submit("PD01", "req-1", "host", validProblem, false);

    // When（submit 後に時間を進める）
    jest.advanceTimersByTime((PROBLEM_DEADLINE_MS + 100) * 3);

    // Then（再委譲は起きない）
    const targets = needProblemTargets(broadcaster);
    expect(targets).toEqual(["host-conn"]);
  });
});

// ─── problemMode による委譲分岐テスト ────────────────────────────────────────

import type { Participant } from "@tasuki/timer-core";

function makeRoomWithMode(mode: "ai" | "fallback", hasAiKey: boolean): Room {
  const participant: Participant = {
    participantId: "host-p",
    connId: "host-c",
    displayName: "Host",
    role: "host",
    presence: "online",
    hasAiKey,
    joinedAt: 1000000,
  };
  return {
    code: "MODERM",
    createdAt: 1000000,
    hostParticipantId: "host-p",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Host"],
      intervalMinutes: 5,
    },
    problem: null,
    session: { rotation: ["Host"], currentIndex: 0, isPaused: false, driverCounts: [0], totalSwitches: 0 },
    clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    phase: "setup",
    participants: [participant],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    problemMode: mode,
  };
}

/**
 * @requirements FR-011
 */
describe("ProblemDelegator: problemMode による分岐", () => {
  it("problemMode=fallback の場合、候補を確認せず即座に定型で確定する", () => {
    // Given
    const store = new InMemoryRoomStore();
    const sentSignals: string[] = [];
    const snapshots: Room[] = [];
    const broadcaster: Broadcaster = {
      broadcastSnapshot: (_code: string, room: Room) => snapshots.push(room),
      sendTo: (connId: string) => sentSignals.push(connId),
      broadcastSignal: () => {},
    };
    const room = makeRoomWithMode("fallback", true);
    store.put(room);
    const delegator = new ProblemDelegator({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      deadlineMs: 100,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    delegator.request("MODERM", "req-mode-fallback");

    // Then（fallback モード: need-problem シグナルを送らずに即座に定型 snapshot）
    expect(sentSignals).toHaveLength(0);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.problem).toBeTruthy();
  });

  it("problemMode=ai かつ候補がいない場合でも定型で確定する", () => {
    // Given（hasAiKey=false なので AI 候補なし）
    const store = new InMemoryRoomStore();
    const snapshots: Room[] = [];
    const broadcaster: Broadcaster = {
      broadcastSnapshot: (_code: string, room: Room) => snapshots.push(room),
      sendTo: () => {},
      broadcastSignal: () => {},
    };
    const room = makeRoomWithMode("ai", false);
    store.put(room);
    const delegator = new ProblemDelegator({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      deadlineMs: 100,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    delegator.request("MODERM", "req-no-candidate");

    // Then（候補なし→定型で確定）
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.problem).toBeTruthy();
  });
});
