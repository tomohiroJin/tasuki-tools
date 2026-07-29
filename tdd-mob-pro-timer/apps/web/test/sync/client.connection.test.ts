/**
 * WS クライアントの接続状態通知のテスト
 * R5-1: onConnectionChange が online/reconnecting で呼ばれることを検証する。
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

describe("SyncClient onConnectionChange", () => {
  it("onopen で online、onclose で reconnecting を通知する", () => {
    const onConnectionChange = vi.fn();
    const client = new SyncClient({
      url: "ws://x",
      onRoom: () => {},
      onConnectionChange,
    });
    client.connect();

    const ws = FakeWS.instances[0]!;
    ws.onopen?.();
    expect(onConnectionChange).toHaveBeenCalledWith("online");

    ws.onclose?.();
    expect(onConnectionChange).toHaveBeenCalledWith("reconnecting");
  });

  it("dispose() 後の onclose では reconnecting を通知しない", () => {
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

    client.dispose();
    ws.onclose?.();
    expect(onConnectionChange).not.toHaveBeenCalledWith("reconnecting");
  });
});
