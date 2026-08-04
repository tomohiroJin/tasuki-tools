/**
 * createJoinRateLimiter() のテスト。
 *
 * 単体では窓内の失敗カウント・窓外の失効を検証する。
 * `room.join` と `ai.unlock` が同一インスタンスの窓を共有することは、
 * モジュール単体では表現できない仕様（2つのコマンドをまたぐ振る舞い）のため、
 * `makeHandlers` を介した統合テストとして直接検証する。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createJoinRateLimiter } from "../src/application/join-rate-limiter.js";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

describe("createJoinRateLimiter", () => {
  describe("窓内の失敗回数カウント", () => {
    /**
     * @requirements FR-158, US3
     */
    it("窓内に記録した失敗はすべて recentFailures に含まれる", () => {
      // Given
      const limiter = createJoinRateLimiter({ windowMs: 10_000, max: 30 });

      // When
      limiter.recordFailure("conn-1", 1_000);
      limiter.recordFailure("conn-1", 2_000);
      limiter.recordFailure("conn-1", 3_000);

      // Then
      expect(limiter.recentFailures("conn-1", 4_000)).toHaveLength(3);
    });

    /**
     * @requirements FR-158, US3
     */
    it("接続ごとに独立してカウントする", () => {
      // Given
      const limiter = createJoinRateLimiter({ windowMs: 10_000, max: 30 });
      limiter.recordFailure("conn-1", 1_000);

      // When
      limiter.recordFailure("conn-2", 1_000);

      // Then
      expect(limiter.recentFailures("conn-1", 1_000)).toHaveLength(1);
      expect(limiter.recentFailures("conn-2", 1_000)).toHaveLength(1);
    });
  });

  describe("窓外の失効", () => {
    /**
     * @requirements FR-158, US3
     */
    it("窓の外に出た失敗は recentFailures から消える", () => {
      // Given
      const limiter = createJoinRateLimiter({ windowMs: 10_000, max: 30 });
      limiter.recordFailure("conn-1", 1_000);

      // When（窓幅10秒を超えて経過）
      const remaining = limiter.recentFailures("conn-1", 12_000);

      // Then
      expect(remaining).toHaveLength(0);
    });

    /**
     * @requirements FR-158, US3
     */
    it("clear で明示的に履歴を破棄すると次の照会は空になる", () => {
      // Given
      const limiter = createJoinRateLimiter({ windowMs: 10_000, max: 30 });
      limiter.recordFailure("conn-1", 1_000);

      // When
      limiter.clear("conn-1");

      // Then
      expect(limiter.recentFailures("conn-1", 1_000)).toHaveLength(0);
    });
  });
});

describe("room.join と ai.unlock のレート制限窓の共有", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  const hostConn = "host-conn";
  const JOIN_FAIL_MAX = 30;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1_000_000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });
  });

  /**
   * @requirements FR-158, FR-159, US3
   */
  it("room.join の連続失敗が上限に達すると、同じ接続の ai.unlock も即座に RATE_LIMITED になる", async () => {
    // Given（ホストとして入室した上で、同じ接続IDで room.join を30回失敗させる。
    //       ai.unlock は在室確認・host権限判定を通す必要があるため、同一接続が
    //       host として在室したまま room.join の別コードで失敗を積む）
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    for (let i = 0; i < JOIN_FAIL_MAX; i++) {
      await handlers.handleCommand(hostConn, {
        command: "room.join",
        code: "NOPE99",
        displayName: "Bob",
        hasAiKey: false,
      });
    }
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("ROOM_NOT_FOUND");

    // When（在室・権限とも満たす同じ接続で ai.unlock を試みる。
    //       共有の窓が消費済みなら合言葉の正否を見る前に RATE_LIMITED になる）
    broadcaster.sent.length = 0;
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("RATE_LIMITED");
  });

  /**
   * @requirements FR-158, FR-159, US3
   */
  it("ai.unlock の連続失敗が上限に達すると、同じ接続の room.join も即座に JOIN_RATE_LIMITED になる", async () => {
    // Given（ホストとして入室し、誤った合言葉で ai.unlock を30回失敗させる）
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    for (let i = 0; i < JOIN_FAIL_MAX; i++) {
      await handlers.handleCommand(hostConn, {
        command: "ai.unlock",
        key: `wrong-${i}`,
      });
    }
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("AI_UNLOCK_FAILED");

    // When（同じ接続で room.join を試みる）
    broadcaster.sent.length = 0;
    const result = await handlers.handleCommand(hostConn, {
      command: "room.join",
      code: "SOME99",
      displayName: "Carol",
      hasAiKey: false,
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe(
      "JOIN_RATE_LIMITED",
    );
  });
});
