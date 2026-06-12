/**
 * ProblemDelegator サーバサイド AI 生成テスト
 * T056: FR-023, FR-024, Task 7
 *
 * serverProvider（サーバ生成）の合流動作を検証する。
 * - 成功: source:"ai" で確定 + snapshot 配信
 * - 失敗: 定型へ縮退
 * - タイムアウト: abort 発火 → 定型縮退
 * - リロール: 旧生成を破棄（stale 防御）
 * - aiUnlocked=false: provider 呼ばず定型確定
 * - limiter 拒否: provider 呼ばず定型確定
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProblemDelegator } from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { AiLimiter } from "../src/application/ai-limits.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg } from "@tdd-mob/core";
import type { ServerProblemProvider } from "../src/ports/server-problem-provider.js";

/** AI 生成で返す有効なお題のフィクスチャ */
const VALID_PROBLEM = {
  title: "Generated Kata",
  description: "AI が生成した説明",
  requirements: ["r1", "r2", "r3"],
  exampleTest: "test('x', () => {})",
  hints: ["h1"],
};

/** テスト用 Room フィクスチャ（既存テストの makeRoom を参考に aiUnlocked 対応を追加） */
function makeRoom(overrides?: Partial<Room>): Room {
  return {
    code: "AI01",
    createdAt: 1000000,
    hostParticipantId: "host",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["A"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["A"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0],
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
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    problemMode: "ai",
    aiUnlocked: true,
    ...overrides,
  };
}

/** テスト用 Broadcaster（snapshot 配信の記録のみ） */
class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: string[] = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];

  broadcastSnapshot(code: string, _room: Room): void {
    this.snapshots.push(code);
  }
  sendTo(connId: string, msg: ServerMsg): void {
    this.sent.push({ connId, msg });
  }
  broadcastSignal(code: string, msg: ServerMsg): void {
    this.signals.push({ roomCode: code, msg });
  }
}

describe("ProblemDelegator サーバ生成", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(Date.now());
    broadcaster = new SpyBroadcaster();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("生成成功で source:'ai' のお題が確定し snapshot 配信される", async () => {
    // Arrange
    const provider: ServerProblemProvider = {
      generate: vi.fn().mockResolvedValue(VALID_PROBLEM),
    };
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 10,
      cooldownMs: 0,
      maxConcurrent: 5,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
    });
    store.put(makeRoom());

    // Act
    delegator.request("AI01", "req-1");
    await vi.runAllTimersAsync();

    // Assert
    const room = store.get("AI01");
    expect(room?.problem?.title).toBe("Generated Kata");
    expect(room?.problem?.source).toBe("ai");
    expect(broadcaster.snapshots).toContain("AI01");
  });

  it("生成 reject は定型バンクへ縮退する", async () => {
    // Arrange
    const provider: ServerProblemProvider = {
      generate: vi.fn().mockRejectedValue(new Error("API エラー")),
    };
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 10,
      cooldownMs: 0,
      maxConcurrent: 5,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
    });
    store.put(makeRoom());

    // Act
    delegator.request("AI01", "req-1");
    await vi.runAllTimersAsync();

    // Assert: お題は非 null かつ AI 生成ではない（定型）
    const room = store.get("AI01");
    expect(room?.problem).not.toBeNull();
    expect(room?.problem?.source).not.toBe("ai");
  });

  it("検証失敗（不正 JSON 構造）も定型へ縮退する", async () => {
    // Arrange
    const provider: ServerProblemProvider = {
      generate: vi.fn().mockResolvedValue({ totally: "wrong shape" }),
    };
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 10,
      cooldownMs: 0,
      maxConcurrent: 5,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
    });
    store.put(makeRoom());

    // Act
    delegator.request("AI01", "req-1");
    await vi.runAllTimersAsync();

    // Assert: 定型へ縮退（source は ai でない）
    const room = store.get("AI01");
    expect(room?.problem).not.toBeNull();
    expect(room?.problem?.source).not.toBe("ai");
  });

  it("タイムアウトで abort され定型へ縮退する", async () => {
    // Arrange: generate は signal abort で reject する。
    // 縮退後にクライアント委譲が走らないよう hasAiKey=false のルームにする
    const provider: ServerProblemProvider = {
      generate: vi.fn().mockImplementation(
        (_lang: string, _diff: string, signal: AbortSignal) =>
          new Promise<unknown>((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    };
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 10,
      cooldownMs: 0,
      maxConcurrent: 5,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
      aiTimeoutMs: 60_000,
    });
    // hasAiKey=false にして縮退後のクライアント委譲で即・定型確定されるようにする
    store.put(makeRoom({
      participants: [{
        participantId: "host",
        connId: "host-conn",
        displayName: "Host",
        role: "host",
        presence: "online",
        hasAiKey: false, // クライアント委譲候補にならないようにする
        joinedAt: 1000000,
      }],
    }));

    // Act: タイムアウトが発火するまで時間を進める
    delegator.request("AI01", "req-1");
    await vi.advanceTimersByTimeAsync(60_001);

    // Assert: 定型へ縮退
    const room = store.get("AI01");
    expect(room?.problem).not.toBeNull();
    expect(room?.problem?.source).not.toBe("ai");
  });

  it("リロール（新 request）で旧生成は破棄される（stale 防御）", async () => {
    // Arrange: 1回目は pending にし、2回目の結果のみ反映される
    let resolveFirst!: (v: unknown) => void;
    const firstGeneration = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });

    const secondProblem = { ...VALID_PROBLEM, title: "Second Kata" };

    const generateFn = vi
      .fn()
      .mockReturnValueOnce(firstGeneration)
      .mockResolvedValueOnce(secondProblem);

    const provider: ServerProblemProvider = { generate: generateFn };

    // cooldownMs: 0 でリロール時の再取得を許す
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 10,
      cooldownMs: 0,
      maxConcurrent: 2,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
    });
    store.put(makeRoom());

    // Act: 1回目 request → リロール（2回目 request）→ 旧 Promise を resolve
    delegator.request("AI01", "req-1");
    delegator.request("AI01", "req-2");

    // 2回目の生成が完了するのを待つ
    await vi.runAllTimersAsync();

    // 旧 Promise を resolve（stale なので無視されるべき）
    resolveFirst(VALID_PROBLEM);
    await vi.runAllTimersAsync();

    // Assert: 2回目の結果（Second Kata）が確定、1回目（Generated Kata）は無視
    const room = store.get("AI01");
    expect(room?.problem?.title).toBe("Second Kata");
    expect(room?.problem?.source).toBe("ai");
  });

  it("aiUnlocked=false のルームでは provider を呼ばず定型確定", async () => {
    // Arrange
    const provider: ServerProblemProvider = {
      generate: vi.fn(),
    };
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 10,
      cooldownMs: 0,
      maxConcurrent: 5,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
    });
    // aiUnlocked=false のルームを登録
    store.put(makeRoom({ aiUnlocked: false }));

    // Act
    delegator.request("AI01", "req-1");
    await vi.runAllTimersAsync();

    // Assert: provider は呼ばれず、定型で確定
    expect(provider.generate).not.toHaveBeenCalled();
    const room = store.get("AI01");
    expect(room?.problem).not.toBeNull();
  });

  it("limiter が拒否したら provider を呼ばず定型確定", async () => {
    // Arrange: dailyLimit: 0 でどんな取得も拒否される
    const provider: ServerProblemProvider = {
      generate: vi.fn(),
    };
    const limiter = new AiLimiter({
      clock,
      dailyLimit: 0,
      cooldownMs: 0,
      maxConcurrent: 5,
    });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
    });
    store.put(makeRoom());

    // Act
    delegator.request("AI01", "req-1");
    await vi.runAllTimersAsync();

    // Assert: provider は呼ばれず、定型で確定
    expect(provider.generate).not.toHaveBeenCalled();
    const room = store.get("AI01");
    expect(room?.problem).not.toBeNull();
  });
});
