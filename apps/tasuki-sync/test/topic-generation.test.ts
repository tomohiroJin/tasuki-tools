/**
 * TopicGenerator のテスト（#91）。
 *
 * サーバー生成と定型の確定・クールダウン・中断・タイムアウトを検証する。
 * フェイクの provider は「呼ばれたら、外から解決・失敗させられる Promise を返す」もの
 * （`problem-delegation.ai.test.ts` の組み立てに揃える）。
 *
 * @requirements #91 E7・E8・E9・E10・E11・E14・E22
 */
import { describe, it, expect, jest } from "bun:test";
import { INITIAL_TOPIC_STATE, type TopicState } from "@tasuki/topic-core";
import { TopicGenerator } from "../src/application/topic-generation.js";
import { InMemoryTopicStore } from "../src/adapters/in-memory-topic-store.js";
import { AiLimiter } from "../src/application/ai-limits.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { ProviderFailure } from "../src/ports/server-topic-provider.js";
import type { ServerTopicProvider } from "../src/ports/server-topic-provider.js";
import type { Logger } from "../src/application/log/logger.js";
import type { LogField } from "../src/application/log/log-safe.js";
import { testLogger, testRefEncoder } from "./support/test-logger.js";

/** 「AI で作る」の既定リクエスト */
const AI_REQ = { mode: "ai" as const, language: "TypeScript" as const, difficulty: "easy" as const };
/** 「定型から作る」の既定リクエスト */
const FALLBACK_REQ = { mode: "fallback" as const, language: "TypeScript" as const, difficulty: "easy" as const };

function makeState(overrides?: Partial<TopicState>): TopicState {
  return { ...INITIAL_TOPIC_STATE, ...overrides };
}

/**
 * 呼ばれたら、外から解決・失敗させられる Promise を返す偽の provider。
 * 本物（`ClaudeCliTopicProvider`）と同じく、signal の abort で
 * `ProviderFailure(..., "timeout")` を reject する。
 */
function makeControllableProvider(): {
  provider: ServerTopicProvider;
  callCount: () => number;
  lastSignal: () => AbortSignal | undefined;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
} {
  let calls = 0;
  let signal: AbortSignal | undefined;
  let resolveFn: ((value: unknown) => void) | undefined;
  let rejectFn: ((err: unknown) => void) | undefined;
  const provider: ServerTopicProvider = {
    generate: (_language, _difficulty, sig) => {
      calls++;
      signal = sig;
      return new Promise<unknown>((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
        sig.addEventListener("abort", () => {
          reject(new ProviderFailure("aborted (timeout/cancel)", "timeout"));
        });
      });
    },
  };
  return {
    provider,
    callCount: () => calls,
    lastSignal: () => signal,
    resolve: (value) => resolveFn?.(value),
    reject: (err) => rejectFn?.(err),
  };
}

/**
 * `publish` の呼び出しをイベント駆動で待つ（ポーリング・sleep をしない）。
 * `problem-delegation.ai.test.ts` の `runAllTimersAsync` に相当するものを
 * 「フェイクタイマーを使わない」このテストファイル向けに書き直したもの。
 */
function makePublishTracker(): {
  publish: (roomCode: string) => void;
  calls: string[];
  waitForCount: (count: number) => Promise<void>;
} {
  const calls: string[] = [];
  const waiters: Array<{ count: number; resolve: () => void }> = [];
  const publish = (roomCode: string): void => {
    calls.push(roomCode);
    for (const waiter of [...waiters]) {
      if (calls.length >= waiter.count) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };
  const waitForCount = (count: number): Promise<void> => {
    if (calls.length >= count) return Promise.resolve();
    return new Promise<void>((resolve) => waiters.push({ count, resolve }));
  };
  return { publish, calls, waitForCount };
}

/**
 * 呼ばれたら、外から解決・失敗させられる Promise を返す偽の provider。
 * `makeControllableProvider` と違い、signal の abort に反応しない
 * （abort で自動的に reject しない）——
 * 「中断のあとに provider が（何らかの事情で）解決してしまっても保管に書かない」ことを
 * 見るテストで使う。abort で自動 reject する provider だと、cancel した瞬間に
 * 先に reject が走ってしまい、狙った成功経路（`.then`）を一度も通さずに
 * `.catch` 経路だけを検証したことになってしまう。
 */
function makeManualProvider(): {
  provider: ServerTopicProvider;
  resolve: (value: unknown) => void;
} {
  let resolveFn: ((value: unknown) => void) | undefined;
  const provider: ServerTopicProvider = {
    generate: () =>
      new Promise<unknown>((resolve) => {
        resolveFn = resolve;
      }),
  };
  return { provider, resolve: (value) => resolveFn?.(value) };
}

/** Promise 連鎖が落ち着くまでマイクロタスクを回す（何も起きないことを確かめる用）。 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/**
 * 呼ばれるたびに独立した「外から解決・失敗させられる Promise」を積む偽の provider。
 * abort には反応しない（`makeManualProvider` と同じ理由）。1 つのルームで
 * 前の生成を中断せずに作り直した場合など、**呼び出しごとに違う resolve/reject を
 * 別々に握りたい**（「先の生成が失敗しても、後の生成の成功だけが確定する」の検証用）。
 */
function makeQueuedProvider(): {
  provider: ServerTopicProvider;
  calls: Array<{ signal: AbortSignal; resolve: (value: unknown) => void; reject: (err: unknown) => void }>;
} {
  const calls: Array<{ signal: AbortSignal; resolve: (value: unknown) => void; reject: (err: unknown) => void }> = [];
  const provider: ServerTopicProvider = {
    generate: (_language, _difficulty, signal) =>
      new Promise<unknown>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  };
  return { provider, calls };
}

describe("TopicGenerator", () => {
  it("定型を求めると、その場で定型を掲げ、縮退しない", () => {
    // Given
    const clock = new FakeClock();
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState());
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    const result = generator.request("R1", FALLBACK_REQ);

    // Then（その場で・縮退なし・配信あり）
    expect(result).toBe("started");
    const state = store.get("R1");
    expect(state?.topic?.source).toBe("fallback");
    expect(state?.degraded).toBe(false);
    expect(state?.generating).toBe(false);
    expect(tracker.calls).toEqual(["R1"]);
  });

  it("AI を求めると生成中を配り、AI のお題で確定する", async () => {
    // Given
    const clock = new FakeClock();
    const { provider, resolve } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When（依頼した直後）
    const result = generator.request("R1", AI_REQ);

    // Then（1 回目の publish の時点で生成中）
    expect(result).toBe("started");
    expect(store.get("R1")?.generating).toBe(true);
    expect(tracker.calls).toEqual(["R1"]);

    // When（provider が有効なお題で解決する）
    resolve({ title: "配列の重複を消す", body: "本文" });
    await tracker.waitForCount(2);

    // Then
    const state = store.get("R1");
    expect(state?.topic).toEqual({ title: "配列の重複を消す", body: "本文", source: "ai" });
    expect(state?.generating).toBe(false);
  });

  it("AI が失敗したら定型へ落として縮退を立てる", async () => {
    // Given
    const clock = new FakeClock();
    const { provider, reject } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    generator.request("R1", AI_REQ);
    reject(new ProviderFailure("claude -p exit 1", "spawnFailed"));
    await tracker.waitForCount(2);

    // Then
    const state = store.get("R1");
    expect(state?.topic?.source).toBe("fallback");
    expect(state?.degraded).toBe(true);
  });

  it("AI の出力が検証に落ちたら定型へ落とす", async () => {
    // Given
    const clock = new FakeClock();
    const { provider, resolve } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When（タイトルが上限 200 字を超える。検証に落ちる）
    generator.request("R1", AI_REQ);
    resolve({ title: "a".repeat(201), body: "" });
    await tracker.waitForCount(2);

    // Then
    const state = store.get("R1");
    expect(state?.degraded).toBe(true);
    expect(state?.topic?.source).not.toBe("ai");
  });

  it("未解錠で AI を求めると、provider を呼ばずに定型へ落とす", () => {
    // Given
    const clock = new FakeClock();
    const provider: ServerTopicProvider = { generate: jest.fn() };
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: false }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    generator.request("R1", AI_REQ);

    // Then
    expect(provider.generate).not.toHaveBeenCalled();
    const state = store.get("R1");
    expect(state?.degraded).toBe(true);
    expect(state?.topic?.source).not.toBe("ai");
  });

  it("provider はあっても aiLimiter が無ければ、provider を呼ばずに定型へ落とす", () => {
    // Given（aiLimiter を渡さない。problem-delegation.ts と同じく provider と aiLimiter は両方揃って初めて AI を使う）
    const clock = new FakeClock();
    const provider: ServerTopicProvider = { generate: jest.fn() };
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    const result = generator.request("R1", AI_REQ);

    // Then
    expect(result).toBe("started");
    expect(provider.generate).not.toHaveBeenCalled();
    const state = store.get("R1");
    expect(state?.degraded).toBe(true);
    expect(state?.topic?.source).not.toBe("ai");
  });

  it("時間切れで定型へ落とす", async () => {
    // Given（短い aiTimeoutMs と、abort で reject する偽の provider。実際の provider と同じ挙動）
    const clock = new FakeClock();
    const { provider } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      aiTimeoutMs: 15,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When（1 回目は開始の publish、2 回目がタイムアウト後の確定）
    generator.request("R1", AI_REQ);
    await tracker.waitForCount(2);

    // Then
    const state = store.get("R1");
    expect(state?.degraded).toBe(true);
    expect(state?.topic?.source).not.toBe("ai");
  });

  it('作り直しがクールダウン中なら "cooldown" を返し、進行中の生成とお題を残す', () => {
    // Given（1 回目を開始。provider は未解決のまま。既定のクールダウンは 10 秒）
    const clock = new FakeClock();
    const { provider, callCount, lastSignal } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });
    const first = generator.request("R1", AI_REQ);
    expect(first).toBe("started");
    expect(callCount()).toBe(1);

    // When（クールダウン中に作り直す）
    const second = generator.request("R1", AI_REQ);

    // Then（拒否・provider は増えず・生成中のまま・1 回目の signal は無事・
    //       お題／縮退／配信のいずれも変わらない）
    expect(second).toBe("cooldown");
    expect(callCount()).toBe(1);
    expect(store.get("R1")?.generating).toBe(true);
    expect(lastSignal()?.aborted).toBe(false);
    expect(store.get("R1")?.topic).toBeNull();
    expect(store.get("R1")?.degraded).toBe(false);
    expect(tracker.calls.length).toBe(1);
  });

  it("中断後に provider が解決しても保管に書かない", async () => {
    // Given（abort に反応しない provider。cancel 後の解決を人為的に起こす）
    const clock = new FakeClock();
    const { provider, resolve } = makeManualProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true, topic: null }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When（開始 → 中断 → 遅れて provider が解決する）
    generator.request("R1", AI_REQ);
    expect(tracker.calls.length).toBe(1); // 開始時の 1 本だけ
    generator.cancel("R1");
    resolve({ title: "落ちてほしいお題", body: "" });
    await flushMicrotasks();

    // Then（お題は開始前のまま。publish も増えない）
    expect(store.get("R1")?.topic).toBeNull();
    expect(tracker.calls.length).toBe(1);
  });

  it("中断で子プロセスの signal が abort される", () => {
    // Given
    const clock = new FakeClock();
    const { provider, lastSignal } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });
    generator.request("R1", AI_REQ);

    // When
    generator.cancel("R1");

    // Then
    expect(lastSignal()?.aborted).toBe(true);
  });

  it("中断すると、遅れて届く provider の失敗（abort 由来）は保管に反映されない", async () => {
    // Given（abort で自動 reject する provider。中断は本物の運用でこの経路を通る）
    const clock = new FakeClock();
    const { provider } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true, topic: null }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When（開始 → 中断。中断の abort が provider の Promise を reject させる。その後片付くまで待つ）
    generator.request("R1", AI_REQ);
    generator.cancel("R1");
    await flushMicrotasks();

    // Then（お題は開始前のまま。publish も開始時の 1 回のまま——
    //       failover の isCurrent ガードを外すと、この reject が定型へ書き込み、
    //       ここが red になる）
    expect(store.get("R1")?.topic).toBeNull();
    expect(tracker.calls.length).toBe(1);
  });

  it("先の生成が失敗しても、後から作り直した生成の成功だけが確定する", async () => {
    // Given（cooldownMs 0 で間を空けずに作り直せる。呼び出しごとに resolve/reject を別々に持てる provider）
    const clock = new FakeClock();
    const { provider, calls } = makeQueuedProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true, topic: null }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When（1 回目を開始 → 中断せず作り直す（2 回目）→ 1 回目が遅れて失敗する）
    generator.request("R1", AI_REQ);
    generator.request("R1", AI_REQ);
    expect(calls.length).toBe(2);
    calls[0]?.reject(new ProviderFailure("stale", "spawnFailed"));
    await flushMicrotasks();

    // Then（1 回目の失敗では確定しない。2 回目はまだ進行中——
    //       isCurrent ガードを外すと、ここで定型へ落ちて red になる）
    expect(store.get("R1")?.topic).toBeNull();
    expect(store.get("R1")?.generating).toBe(true);
    expect(tracker.calls.length).toBe(2); // 1 回目の開始・2 回目の開始のみ

    // When（2 回目が成功で解決する）
    calls[1]?.resolve({ title: "後の生成", body: "本文" });
    await tracker.waitForCount(3);

    // Then（2 回目の結果で確定する）
    const state = store.get("R1");
    expect(state?.topic).toEqual({ title: "後の生成", body: "本文", source: "ai" });
    expect(state?.generating).toBe(false);
  });

  describe("限度枠の返却（グローバル同時実行 1 のため、返さないとサーバー全体の AI が止まる）", () => {
    it("成功したら枠を返す", async () => {
      // Given
      const clock = new FakeClock();
      const { provider, resolve } = makeControllableProvider();
      const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
      const tracker = makePublishTracker();
      const store = new InMemoryTopicStore();
      store.put("R1", makeState({ aiUnlocked: true }));
      const generator = new TopicGenerator({
        topics: store,
        clock,
        publish: tracker.publish,
        provider,
        aiLimiter: limiter,
        logger: testLogger,
        refEncoder: testRefEncoder,
      });

      // When
      generator.request("R1", AI_REQ);
      resolve({ title: "お題", body: "" });
      await tracker.waitForCount(2);

      // Then（別ルームがすぐ枠を取れる＝枠が返っている。release() を finish から外すと red になる）
      const other = limiter.tryAcquire("R2");
      expect(other.ok).toBe(true);
      if (other.ok) other.release();
    });

    it("AI が失敗しても枠を返す", async () => {
      // Given
      const clock = new FakeClock();
      const { provider, reject } = makeControllableProvider();
      const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
      const tracker = makePublishTracker();
      const store = new InMemoryTopicStore();
      store.put("R1", makeState({ aiUnlocked: true }));
      const generator = new TopicGenerator({
        topics: store,
        clock,
        publish: tracker.publish,
        provider,
        aiLimiter: limiter,
        logger: testLogger,
        refEncoder: testRefEncoder,
      });

      // When
      generator.request("R1", AI_REQ);
      reject(new ProviderFailure("boom", "spawnFailed"));
      await tracker.waitForCount(2);

      // Then
      const other = limiter.tryAcquire("R2");
      expect(other.ok).toBe(true);
      if (other.ok) other.release();
    });

    it("タイムアウトしても枠を返す", async () => {
      // Given
      const clock = new FakeClock();
      const { provider } = makeControllableProvider();
      const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
      const tracker = makePublishTracker();
      const store = new InMemoryTopicStore();
      store.put("R1", makeState({ aiUnlocked: true }));
      const generator = new TopicGenerator({
        topics: store,
        clock,
        publish: tracker.publish,
        provider,
        aiLimiter: limiter,
        aiTimeoutMs: 15,
        logger: testLogger,
        refEncoder: testRefEncoder,
      });

      // When
      generator.request("R1", AI_REQ);
      await tracker.waitForCount(2);

      // Then
      const other = limiter.tryAcquire("R2");
      expect(other.ok).toBe(true);
      if (other.ok) other.release();
    });

    it("中断しても枠を返す", () => {
      // Given
      const clock = new FakeClock();
      const { provider } = makeControllableProvider();
      const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
      const tracker = makePublishTracker();
      const store = new InMemoryTopicStore();
      store.put("R1", makeState({ aiUnlocked: true }));
      const generator = new TopicGenerator({
        topics: store,
        clock,
        publish: tracker.publish,
        provider,
        aiLimiter: limiter,
        logger: testLogger,
        refEncoder: testRefEncoder,
      });

      // When
      generator.request("R1", AI_REQ);
      generator.cancel("R1");

      // Then（release() を cancel から外すと red になる）
      const other = limiter.tryAcquire("R2");
      expect(other.ok).toBe(true);
      if (other.ok) other.release();
    });
  });

  it("provider が同期的に例外を投げても、定型へ落として枠を返す", async () => {
    // Given（呼ばれた瞬間に（Promise を返さず）例外を投げる provider）
    const clock = new FakeClock();
    const provider: ServerTopicProvider = {
      generate: () => {
        throw new Error("同期的に壊れた provider");
      },
    };
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    generator.request("R1", AI_REQ);
    await tracker.waitForCount(2);

    // Then（定型へ縮退し、枠も返っている＝ active/timer/枠が残って固まっていない）
    const state = store.get("R1");
    expect(state?.degraded).toBe(true);
    expect(state?.topic?.source).not.toBe("ai");
    expect(state?.generating).toBe(false);
    const other = limiter.tryAcquire("R2");
    expect(other.ok).toBe(true);
    if (other.ok) other.release();
  });

  it("日次上限なら定型へ落として縮退する", () => {
    // Given（dailyLimit: 0 でどんな取得も拒否される）
    const clock = new FakeClock();
    const provider: ServerTopicProvider = { generate: jest.fn() };
    const limiter = new AiLimiter({ clock, dailyLimit: 0, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    generator.request("R1", AI_REQ);

    // Then
    expect(provider.generate).not.toHaveBeenCalled();
    const state = store.get("R1");
    expect(state?.degraded).toBe(true);
  });

  it("ルームの状態が無ければ、provider も publish も呼ばずに何もしない", () => {
    // Given（store.get が undefined を返すルーム）
    const clock = new FakeClock();
    const provider: ServerTopicProvider = { generate: jest.fn() };
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: testLogger,
      refEncoder: testRefEncoder,
    });

    // When
    const result = generator.request("GONE", AI_REQ);

    // Then
    expect(result).toBe("started");
    expect(provider.generate).not.toHaveBeenCalled();
    expect(tracker.calls).toEqual([]);
    expect(store.get("GONE")).toBeUndefined();
  });

  it("ログにお題のタイトルが出ない", async () => {
    // Given（検証に落ちる AI 出力。本文が上限 4000 字を超える。タイトルは判別しやすい文字列にする）
    const secretTitle = "極秘タイトルXYZ789";
    const captured: Array<Record<string, LogField> | undefined> = [];
    const spyLogger: Logger = {
      info: () => {},
      warn: (_event, fields) => {
        captured.push(fields);
      },
      error: () => {},
    };
    const clock = new FakeClock();
    const { provider, resolve } = makeControllableProvider();
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const tracker = makePublishTracker();
    const store = new InMemoryTopicStore();
    store.put("R1", makeState({ aiUnlocked: true }));
    const generator = new TopicGenerator({
      topics: store,
      clock,
      publish: tracker.publish,
      provider,
      aiLimiter: limiter,
      logger: spyLogger,
      refEncoder: testRefEncoder,
    });

    // When
    generator.request("R1", AI_REQ);
    resolve({ title: secretTitle, body: "y".repeat(4001) });
    await tracker.waitForCount(2);

    // Then（ログへ渡ったどのフィールドにも AI のタイトル文字列が無い）
    expect(captured.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(captured);
    expect(serialized.includes(secretTitle)).toBe(false);
  });
});
