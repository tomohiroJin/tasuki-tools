/**
 * WS クライアントの再接続検知のテスト（Issue #24）
 *
 * 初回接続と、切断後にスケジュールされた再接続を区別できるのは SyncClient 内部だけ
 * （App 側からは区別できない）。onReconnected はリジューム再送のトリガーに使う。
 *
 * @requirements FR-002, FR-003
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncClient } from "../../src/sync/client.js";
import { FakeWS } from "../support/fakes.js";

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SyncClient onReconnected", () => {
  it("初回 connect() の onopen では呼ばれない", () => {
    // Given
    const onReconnected = vi.fn();
    const client = new SyncClient({ url: "ws://x", onRoom: () => {}, onReconnected });

    // When
    client.connect();
    FakeWS.instances[0]!.onopen?.();

    // Then
    expect(onReconnected).not.toHaveBeenCalled();
  });

  it("切断→バックオフ後の再接続の onopen では呼ばれる", () => {
    // Given
    const onReconnected = vi.fn();
    const client = new SyncClient({ url: "ws://x", onRoom: () => {}, onReconnected });
    client.connect();
    const firstWs = FakeWS.instances[0]!;
    firstWs.onopen?.();

    // When: 切断 → 再接続タイマーを進める
    firstWs.onclose?.();
    vi.runOnlyPendingTimers();
    const secondWs = FakeWS.instances[1]!;
    secondWs.onopen?.();

    // Then
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });

  it("onReconnected 未指定でもエラーにならない（optional）", () => {
    const client = new SyncClient({ url: "ws://x", onRoom: () => {} });
    client.connect();
    expect(() => FakeWS.instances[0]!.onopen?.()).not.toThrow();
  });
});
