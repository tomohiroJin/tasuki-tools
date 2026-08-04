/**
 * WS クライアントの接続状態通知のテスト
 * onConnectionChange が online/reconnecting で呼ばれることを検証する。
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

/**
 * @requirements R5-1
 */
describe("SyncClient onConnectionChange", () => {
  it("onopen で online、onclose で reconnecting を通知する", () => {
    // Given
    const onConnectionChange = vi.fn();
    const client = new SyncClient({
      url: "ws://x",
      onRoom: () => {},
      onConnectionChange,
    });
    client.connect();
    const ws = FakeWS.instances[0]!;

    // When
    ws.onopen?.();
    // Then
    expect(onConnectionChange).toHaveBeenCalledWith("online");

    // When
    ws.onclose?.();
    // Then
    expect(onConnectionChange).toHaveBeenCalledWith("reconnecting");
  });

  it("dispose() 後の onclose では reconnecting を通知しない", () => {
    // Given
    const onConnectionChange = vi.fn();
    const client = new SyncClient({
      url: "ws://x",
      onRoom: () => {},
      onConnectionChange,
    });
    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.onopen?.();
    onConnectionChange.mockClear();

    // When
    client.dispose();
    ws.onclose?.();

    // Then
    expect(onConnectionChange).not.toHaveBeenCalledWith("reconnecting");
  });
});
