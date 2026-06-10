/**
 * WS クライアントの接続状態通知のテスト
 * R5-1: onConnectionChange が online/reconnecting で呼ばれることを検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncClient } from "../../src/sync/client.js";

/** onopen/onclose を手動発火できる最小 WebSocket スタブ。 */
class FakeWS {
  static instances: FakeWS[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(): void {}
  close(): void {}
}

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
