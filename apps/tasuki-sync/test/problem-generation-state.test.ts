/**
 * 「生成中」をサーバー権威の状態にする（#283）。
 *
 * これが無かった頃、生成中はクライアント局所のフラグ＋お題の内容差分
 * （`shouldClearGenerating`）＋65 秒の安全弁で持っていた。内容差分は
 * **同じお題が選ばれた場合を変化と見なせず**、再接続した端末には
 * **いま作り直している最中かが伝わらない**。どちらも「降りない」側へ倒れる。
 *
 * ここでは帳簿（`TimerState.problemGeneration` → wire の `Room.problemGeneration`）が
 * **委譲の開始と終了で必ず動く**ことを、配信された snapshot の側から確かめる。
 * 観測点を帳簿ではなく snapshot に置くのは、利用者へ届くのがそちらだからである。
 *
 * @requirements #283 EARS 1・EARS 2・EARS 3
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import {
  ProblemDelegator,
  PROBLEM_DEADLINE_MS,
} from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { AiLimiter } from "../src/application/ai-limits.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room } from "@tasuki/timer-core";
import type { ServerProblemProvider } from "../src/ports/server-problem-provider.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { putRoomView, roomViewOf } from "./support/room-view.js";
import { testLogger, testRefEncoder } from "./support/test-logger.js";

const VALID_PROBLEM = {
  title: "Generated Kata",
  description: "AI が生成した説明",
  requirements: ["r1", "r2", "r3"],
  exampleTest: "test('x', () => {})",
  hints: ["h1"],
};

/**
 * 2 人が居るルーム。**片方は AI 鍵を持たない**ので、`hasAiKey` の候補は 1 人だけになる。
 *
 * 既定は「AI 解錠済み・AI モード」である（#283 の穴 3 が生きているのはこの形の
 * ルームだけで、実クライアントは常に `hasAiKey: false` を送るため
 * クライアント委譲の経路は実質死んでいる）。
 */
function makeRoom(overrides?: Partial<Room>): Room {
  const rotation = ["alice", "bob"];
  return {
    code: "GEN01",
    createdAt: 1_000_000,
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation,
      currentIndex: 0,
      isPaused: false,
      driverCounts: rotation.map(() => 0),
      totalSwitches: 0,
      seats: rotation.map((id) => ({ id, displayName: id, isProxy: false, skipReason: null })),
      nextIndex: 1,
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
        participantId: "alice",
        displayName: "Alice",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1_000_000,
      },
      {
        participantId: "bob",
        displayName: "Bob",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1_000_100,
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

const CONNS = { alice: ["alice-conn"], bob: ["bob-conn"] } as const;

/** Promise 連鎖が落ち着くまでマイクロタスクを回す（`problem-delegation.ai.test.ts` と同じ作法）。 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function runAllTimersAsync(): Promise<void> {
  jest.runAllTimers();
  await flushMicrotasks();
}

describe("ProblemDelegator: 生成中はサーバー権威（#283）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1_700_000_000_000);
    broadcaster = new SpyBroadcaster();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** 返らない provider（生成中のまま止めたいとき用）。 */
  function pendingProvider(): ServerProblemProvider {
    return { generate: jest.fn().mockReturnValue(new Promise<never>(() => {})) };
  }

  function makeDelegator(opts: {
    serverProvider?: ServerProblemProvider;
    aiLimiter?: AiLimiter;
    aiTimeoutMs?: number;
  } = {}): ProblemDelegator {
    return new ProblemDelegator({
      store,
      timers,
      clock,
      broadcaster,
      logger: testLogger,
      refEncoder: testRefEncoder,
      ...(opts.serverProvider ? { serverProvider: opts.serverProvider } : {}),
      ...(opts.aiLimiter ? { aiLimiter: opts.aiLimiter } : {}),
      ...(opts.aiTimeoutMs !== undefined ? { aiTimeoutMs: opts.aiTimeoutMs } : {}),
    });
  }

  function generousLimiter(): AiLimiter {
    return new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0, maxConcurrent: 5 });
  }

  // ─── EARS 1: 作り直している間、在室者全員にその旨を示す ────────────────────

  it("サーバー生成の返りを待っている間、配信された snapshot が生成中を伝える", () => {
    // Given: AI 解錠済みのルームと、返ってこない provider
    const delegator = makeDelegator({
      serverProvider: pendingProvider(),
      aiLimiter: generousLimiter(),
    });
    putRoomView(store, timers, makeRoom(), CONNS);

    // When: お題を依頼する（返りはまだ来ない）
    delegator.request("GEN01", "req-1");

    // Then: 配信された snapshot が「生成中」を言っている。
    // **観測点は配信である。** 帳簿を直接見ると、在室者へ届いたかが分からない。
    const sent = broadcaster.snapshots.filter((s) => s.roomCode === "GEN01");
    expect(sent.length).toBe(1);
    expect(sent[0]!.room.problemGeneration).toEqual({ active: true, degraded: false });
    // お題はまだ無い（生成中は「お題が無い」とは別の情報である）
    expect(sent[0]!.room.problem).toBeNull();
  });

  it("生成中に入ってきた端末の snapshot にも生成中が載る（再接続で欠けない）", () => {
    // Given: サーバー生成の返りを待っている
    const delegator = makeDelegator({
      serverProvider: pendingProvider(),
      aiLimiter: generousLimiter(),
    });
    putRoomView(store, timers, makeRoom(), CONNS);
    delegator.request("GEN01", "req-1");

    // When: いま繋ぎ直した端末が受け取る形（保管から組み直した snapshot）を見る
    const fresh = roomViewOf(store, timers, "GEN01");

    // Then: お題の内容差分では表せない「作り直している最中」が載っている。
    // 途中から来た端末は前の snapshot を持たないので、差分では永久に判定できない。
    expect(fresh.problemGeneration).toEqual({ active: true, degraded: false });
  });

  it("同じ tick で確定する依頼では、生成中だけの snapshot を挟まない", () => {
    // Given: 定型モードのルーム（依頼と確定が同じ tick で終わる）
    const delegator = makeDelegator();
    putRoomView(store, timers, makeRoom({ problemMode: "fallback", aiUnlocked: false }), CONNS);

    // When
    delegator.request("GEN01", "req-1");

    // Then: 配信は確定の 1 本だけで、その中身は「生成中ではない」。
    // 見せる「間」が無いのに 2 本送ると、受け手は無意味な再描画をするだけである。
    const sent = broadcaster.snapshots.filter((s) => s.roomCode === "GEN01");
    expect(sent.length).toBe(1);
    expect(sent[0]!.room.problemGeneration).toEqual({ active: false, degraded: false });
    expect(sent[0]!.room.problem).not.toBeNull();
  });

  // ─── EARS 2: 同じお題が選ばれても表示を解除する ───────────────────────────

  it("作り直しの結果が前と同じお題でも、生成中は降りる", () => {
    // Given: 定型で確定したお題が既に載っているルーム。
    // **`pickFallback` は `Math.abs(now) % candidates.length` で選ぶので、同じ時刻なら
    //   必ず同じお題が返る。** これが #283 の穴 1（内容差分では降ろせない）そのものである。
    const delegator = makeDelegator();
    putRoomView(store, timers, makeRoom({ problemMode: "fallback", aiUnlocked: false }), CONNS);
    delegator.request("GEN01", "req-1");
    const first = broadcaster.snapshots.at(-1)!.room;

    // When: 時刻を動かさずにもう一度依頼する（＝同じお題が選ばれる）
    delegator.request("GEN01", "req-2");

    // Then: お題は 1 文字も変わっていないのに、生成中は降りている
    const second = broadcaster.snapshots.at(-1)!.room;
    expect(second.problem?.title).toBe(first.problem!.title);
    expect(second.problem?.source).toBe(first.problem!.source);
    expect(second.problemGeneration).toEqual({ active: false, degraded: false });
  });

  it("サーバー生成が成功したら、生成中が降りて縮退の印も立たない", async () => {
    // Given
    const provider: ServerProblemProvider = {
      generate: jest.fn().mockResolvedValue(VALID_PROBLEM),
    };
    const delegator = makeDelegator({ serverProvider: provider, aiLimiter: generousLimiter() });
    putRoomView(store, timers, makeRoom(), CONNS);

    // When
    delegator.request("GEN01", "req-1");
    await runAllTimersAsync();

    // Then
    const last = broadcaster.snapshots.at(-1)!.room;
    expect(last.problem?.source).toBe("ai");
    expect(last.problemGeneration).toEqual({ active: false, degraded: false });
  });

  // ─── EARS 3: AI から定型へ縮退したことを利用者へ示す ──────────────────────

  it("AI の枠が取れずに定型へ落ちたら、縮退の印が立つ", () => {
    // Given: クールダウン中の limiter（#283 の穴 3 ——
    // 走っている生成を設定変更が中断した直後がちょうどこの形になる）
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 60_000, maxConcurrent: 5 });
    const acquired = limiter.tryAcquire("GEN01");
    expect(acquired.ok).toBe(true); // 前提: 1 本目は取れる
    if (acquired.ok) acquired.release();
    const delegator = makeDelegator({ serverProvider: pendingProvider(), aiLimiter: limiter });
    putRoomView(store, timers, makeRoom(), CONNS);

    // When: 取り直そうとする（クールダウンで枠が取れない）
    delegator.request("GEN01", "req-2");

    // Then: 定型で確定し、AI から落ちたことが snapshot に載る
    const last = broadcaster.snapshots.at(-1)!.room;
    expect(last.problem?.source).toBe("fallback");
    expect(last.problemGeneration).toEqual({ active: false, degraded: true });
  });

  it("サーバー生成が失敗して定型へ縮退したら、縮退の印が立つ", async () => {
    // Given
    const provider: ServerProblemProvider = {
      generate: jest.fn().mockRejectedValue(new Error("API エラー")),
    };
    const delegator = makeDelegator({ serverProvider: provider, aiLimiter: generousLimiter() });
    putRoomView(store, timers, makeRoom(), CONNS);

    // When
    delegator.request("GEN01", "req-1");
    await runAllTimersAsync();

    // Then
    const last = broadcaster.snapshots.at(-1)!.room;
    expect(last.problem?.source).toBe("fallback");
    expect(last.problemGeneration).toEqual({ active: false, degraded: true });
  });

  it("最初から定型モードのルームでは、縮退の印は立たない", () => {
    // Given: AI を試みてすらいないルーム。ここで印が立つと
    // 「AI での生成ができませんでした」が常時出っぱなしになる。
    const delegator = makeDelegator();
    putRoomView(store, timers, makeRoom({ problemMode: "fallback", aiUnlocked: false }), CONNS);

    // When
    delegator.request("GEN01", "req-1");

    // Then
    expect(broadcaster.snapshots.at(-1)!.room.problemGeneration).toEqual({
      active: false,
      degraded: false,
    });
  });

  it("縮退したあと AI で作れたら、印は次の確定で降りる", async () => {
    // Given: 1 本目はクールダウンで定型へ落ちた
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 60_000, maxConcurrent: 5 });
    const first = limiter.tryAcquire("GEN01");
    if (first.ok) first.release();
    const provider: ServerProblemProvider = {
      generate: jest.fn().mockResolvedValue(VALID_PROBLEM),
    };
    const delegator = makeDelegator({ serverProvider: provider, aiLimiter: limiter });
    putRoomView(store, timers, makeRoom(), CONNS);
    delegator.request("GEN01", "req-2");
    expect(broadcaster.snapshots.at(-1)!.room.problemGeneration?.degraded).toBe(true);

    // When: クールダウンが明けてから取り直す
    clock.advance(60_001);
    delegator.request("GEN01", "req-3");
    await runAllTimersAsync();

    // Then: AI で作れたので印は降りている
    const last = broadcaster.snapshots.at(-1)!.room;
    expect(last.problem?.source).toBe("ai");
    expect(last.problemGeneration).toEqual({ active: false, degraded: false });
  });

  // ─── 委譲が畳まれても降りる ───────────────────────────────────────────────

  it("代表の期限切れで定型に落ち着いたときも、生成中は降りる", async () => {
    // Given: AI 鍵を持つ代表が 1 人だけ居るルーム（クライアント委譲の経路）
    const delegator = makeDelegator();
    putRoomView(
      store,
      timers,
      makeRoom({
        problemMode: "ai",
        aiUnlocked: false,
        participants: [
          {
            participantId: "alice",
            displayName: "Alice",
            presence: "online",
            hasAiKey: true,
            joinedAt: 1_000_000,
          },
        ],
      }),
      { alice: ["alice-conn"] },
    );

    // When: 依頼だけして、期限まで誰も投入しない
    delegator.request("GEN01", "req-1");
    expect(broadcaster.snapshots.at(-1)!.room.problemGeneration?.active).toBe(true);
    jest.advanceTimersByTime(PROBLEM_DEADLINE_MS + 1);
    await flushMicrotasks();

    // Then: 定型で確定し、生成中は降りている
    const last = broadcaster.snapshots.at(-1)!.room;
    expect(last.problem).not.toBeNull();
    expect(last.problemGeneration?.active).toBe(false);
  });
});
