/**
 * レート制限へ渡す `now` は単調時計であること（#596・設計正本 `2026-08-14-ip-rate-limit-design.md` D8）。
 *
 * 契約: `RateLimitGate.shouldReject` / `consume` と `PokerRateLimitGate.begin` の `now` は
 * **`MonotonicClock.now()` の値**でなければならない。壁時計（`WallClock.now()`・epoch ms）は NTP の
 * ステップ調整で戻りうるので、渡すと窓の計測が壊れる。**どちらも `number` なので型では混ぜても通る**
 * （ID のブランド型は入れない方針なので、時刻の別系統は型ではなくテストで守る）。
 *
 * 守り方: 壁時計と単調時計に**十分離れた別の値**を返させ、ゲートへ届いた `now` が単調時計の値であることを見る。
 * join 側（`room.join`）は `join-rate-limit.test.ts` が壁時計を飛ばして見ている。ここは残りの入口
 * （ルームの生死の照会・お題の合言葉・poker のゲート）を見る。
 */
import { describe, expect, it } from "bun:test";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC, type RateLimiter } from "@tasuki/rate-limit";
import { checkRoom } from "../src/application/check-room.js";
import { createPokerRateLimitGate } from "../src/application/poker-rate-limit-gate.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { makeTopicHandlers } from "../src/application/topic-handlers.js";
import { makeTopicBroadcaster } from "../src/application/topic-broadcast.js";
import { createTokenStore } from "../src/application/token-store.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { InMemoryTopicStore } from "../src/adapters/in-memory-topic-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyHub } from "./support/hub.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

/** 単調時計の値（壁時計の値とは桁が違う） */
const MONOTONIC_NOW = 4_321;
/** 壁時計の値（epoch ms 相当） */
const WALL_NOW = 1_700_000_000_000;

/** 実物の限定器の `shouldReject` / `consume` だけを差し替えた記録用（残りの口は実物のまま） */
function spyLimiter(onCall: (key: string, now: number) => void): RateLimiter {
  const real = createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC });
  return {
    ...real,
    shouldReject: (key, now) => {
      onCall(key, now);
      return false;
    },
    consume: (key, now) => {
      onCall(key, now);
    },
  };
}

/** `shouldReject` / `consume` へ届いた `now` を記録するゲート */
function recordingGate(rejects = false): {
  gate: { shouldReject: (connId: string, now: number) => boolean; consume: (connId: string, now: number) => void };
  nows: number[];
} {
  const nows: number[] = [];
  return {
    nows,
    gate: {
      shouldReject: (_connId, now) => {
        nows.push(now);
        return rejects;
      },
      consume: (_connId, now) => {
        nows.push(now);
      },
    },
  };
}

describe("レート制限へ渡す now は単調時計（D8）", () => {
  it("WHEN ルームの生死を照会して無い THE checkRoom SHALL 判定にも消費にも単調時計の値を渡す", () => {
    const { gate, nows } = recordingGate();

    const result = checkRoom(
      { store: { get: () => undefined }, rateLimitGate: gate, monotonicClock: { now: () => MONOTONIC_NOW } },
      { connId: "c1", code: "nope" },
    );

    expect(result.isErr()).toBe(true);
    expect(nows).toEqual([MONOTONIC_NOW, MONOTONIC_NOW]);
  });

  it("WHEN お題の合言葉を誤る THE ハンドラ SHALL 判定にも消費にも単調時計の値を渡す（壁時計ではない）", async () => {
    const { gate, nows } = recordingGate();
    const store = new InMemoryRoomStore();
    const topics = new InMemoryTopicStore();
    const sent: unknown[] = [];
    const real = makeTopicBroadcaster({ store, topics, send: (ids, msg) => void sent.push([ids, msg]) });
    const handlers = makeTopicHandlers({
      monotonicClock: { now: () => MONOTONIC_NOW },
      store,
      timers: new InMemoryTimerStore(),
      clock: new FakeClock(WALL_NOW),
      codeGen: new FakeCodeGen(),
      tokenStore: createTokenStore(),
      rateLimitGate: { open: () => {}, close: () => {}, ...gate },
      hub: spyHub(),
      timerBroadcaster: new SpyBroadcaster(),
      topics,
      generator: { request: () => "started", cancel: () => {} },
      broadcaster: { publish: (code) => real.publish(code), sendCurrent: real.sendCurrent },
      send: () => {},
      aiUnlockKey: "correct-horse",
    });
    store.put({ code: "ROOM-A", createdAt: 0, participants: [] });
    await handlers.handleMessage("topic-1", JSON.stringify({ command: "room.join", code: "ROOM-A", displayName: "Alice" }));
    nows.length = 0; // 入室の判定は除く。見るのは合言葉の判定から

    await handlers.handleMessage("topic-1", JSON.stringify({ command: "ai.unlock", key: "wrong" }));

    expect(nows.length).toBeGreaterThan(0);
    expect(nows.every((n) => n === MONOTONIC_NOW)).toBe(true);
  });

  it("WHEN poker のゲートが 1 判定を始める THE begin SHALL 単調時計を 1 度だけ読み、判定と消費に同じ値を使う", () => {
    const seen: number[] = [];
    const limiter = spyLimiter((_key, now) => void seen.push(now));
    let reads = 0;
    const gate = createPokerRateLimitGate({
      clock: {
        now: () => {
          reads += 1;
          return MONOTONIC_NOW + reads; // 読むたびに値が変わる
        },
      },
      rateLimiter: limiter,
    });

    const decision = gate.begin("key-1");
    decision.consumeOnMiss();

    expect(reads).toBe(1);
    expect(seen).toEqual([MONOTONIC_NOW + 1, MONOTONIC_NOW + 1]);
  });

  it("WHEN 接続 ID を鍵へ引く THE RateLimitGate SHALL now を解釈せずそのまま限定器へ渡す", () => {
    const seen: Array<[string, number]> = [];
    const limiter = spyLimiter((key, now) => void seen.push([key, now]));
    const gate = createRateLimitGate(limiter);
    gate.open("conn-1", "client-key");

    gate.shouldReject("conn-1", MONOTONIC_NOW);
    gate.consume("conn-1", MONOTONIC_NOW);

    expect(seen).toEqual([
      ["client-key", MONOTONIC_NOW],
      ["client-key", MONOTONIC_NOW],
    ]);
  });

  it("対照: 実物の限定器でも、判定と消費に同じ単調時計の値を使えば窓は進まない（壁時計の飛びを模さない）", () => {
    const limiter = createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC });
    const gate = createRateLimitGate(limiter);
    for (let i = 0; i < DEFAULT_CAPACITY; i++) gate.consume("c", MONOTONIC_NOW);

    expect(gate.shouldReject("c", MONOTONIC_NOW)).toBe(true);
  });
});
