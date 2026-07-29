/**
 * 破棄後は切断の通知を上げない（host-spof-relaxation G6・T038）
 *
 * 退出させられた側の画面に「接続が切れました。再接続しています...」が出て、
 * 退出した事実も再参加できる旨も表示されないという欠陥が実機検証で見つかった。
 *
 * 順序は次のとおり:
 *   1. 退出通知を受けてクライアントを破棄し、同期的に退出の文言を表示する
 *   2. 破棄によって WebSocket の close が**後から**発火する
 *   3. close ハンドラが切断の通知を上げ、1 の文言を上書きする
 *
 * 破棄済みなので再接続は行われず、「再接続しています」は事実にも反する。
 * 再接続の予約は破棄フラグで抑止されていたが、通知だけが抑止対象から漏れていた。
 *
 * 設計: docs/plans/host-spof-relaxation/plan.md「D8」
 * 要件: FR-086
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

describe("SyncClient: 破棄後の切断通知（FR-086）", () => {
  it("dispose() 後に close が発火しても onDisconnected を呼ばない", () => {
    const onDisconnected = vi.fn();
    const client = new SyncClient({ url: "ws://x", onRoom: () => {}, onDisconnected });
    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.onopen?.();

    // 退出通知を受けたときの経路。破棄してから close が後追いで発火する。
    client.dispose();
    ws.onclose?.();

    expect(onDisconnected).not.toHaveBeenCalled();
  });

  it("dispose() していない切断では従来どおり onDisconnected を呼ぶ（再接続の導線を壊さない）", () => {
    const onDisconnected = vi.fn();
    const client = new SyncClient({ url: "ws://x", onRoom: () => {}, onDisconnected });
    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.onopen?.();

    ws.onclose?.();

    expect(onDisconnected).toHaveBeenCalledTimes(1);
  });

  it("dispose() 後の close では onConnectionChange('reconnecting') も呼ばない（既存の抑止の固定）", () => {
    const onConnectionChange = vi.fn();
    const client = new SyncClient({ url: "ws://x", onRoom: () => {}, onConnectionChange });
    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.onopen?.();
    onConnectionChange.mockClear();

    client.dispose();
    ws.onclose?.();

    expect(onConnectionChange).not.toHaveBeenCalled();
  });

  it("dispose() 後の close では再接続を予約しない（新しい接続を作らない）", () => {
    const client = new SyncClient({ url: "ws://x", onRoom: () => {} });
    client.connect();
    const ws = FakeWS.instances[0]!;
    ws.onopen?.();

    client.dispose();
    ws.onclose?.();
    vi.advanceTimersByTime(60_000);

    expect(FakeWS.instances).toHaveLength(1);
  });
});
