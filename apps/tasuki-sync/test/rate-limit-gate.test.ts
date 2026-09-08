/**
 * createRateLimitGate() のテスト。
 *
 * ゲートは「connId → クライアント鍵」の対応だけを持ち、数える仕事は
 * @tasuki/rate-limit のバケツに委ねる。**同一 IP の複数接続が同じバケツを共有する**
 * ことがこの層の存在理由である（接続を張り直しても窓がリセットされない）。
 */
import { describe, it, expect } from "bun:test";
import { createTokenBucketLimiter } from "@tasuki/rate-limit";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";

const T0 = 1_000_000;

describe("createRateLimitGate", () => {
  it("同じ鍵で開いた別々の接続はバケツを共有する", () => {
    // Given
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");
    gate.open("conn-2", "key-A");

    // When
    gate.consume("conn-1", T0);

    // Then
    expect(gate.shouldReject("conn-2", T0)).toBe(true);
  });

  it("鍵が違えば独立している", () => {
    // Given
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");
    gate.open("conn-2", "key-B");

    // When
    gate.consume("conn-1", T0);

    // Then
    expect(gate.shouldReject("conn-2", T0)).toBe(false);
  });

  it("接続を閉じて張り直しても、同じ鍵ならバケツは引き継がれる", () => {
    // Given
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");
    gate.consume("conn-1", T0);
    gate.close("conn-1");

    // When
    gate.open("conn-2", "key-A");

    // Then
    expect(gate.shouldReject("conn-2", T0)).toBe(true);
  });

  it("open していない connId は connId 自身を鍵にする（in-process テストの経路）", () => {
    // Given
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));

    // When
    gate.consume("conn-1", T0);

    // Then
    expect(gate.shouldReject("conn-1", T0)).toBe(true);
    expect(gate.shouldReject("conn-2", T0)).toBe(false);
  });

  /**
   * Task 4 からの申し送り（契約）: `WsAdapterOptions.onDisconnect` は `onConnect` が
   * throw した接続に対しても呼ばれる。つまり `open()` を経ていない connId が
   * `close()` に渡されうる。ここが throw すると、切断のたびに例外が上がる。
   */
  it("open していない connId を close しても throw せず、他の対応も壊さない", () => {
    // Given
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");

    // When
    expect(() => gate.close("never-opened")).not.toThrow();

    // Then（既存の対応は残っている＝conn-1 は依然 key-A のバケツを使う）
    gate.consume("conn-1", T0);
    gate.open("conn-2", "key-A");
    expect(gate.shouldReject("conn-2", T0)).toBe(true);
  });
});
