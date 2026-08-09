/**
 * WS アダプタのメッセージ経路の振る舞いテスト。
 *
 * ⚠ **このファイルは網の穴を埋めるために新設された。**
 * ws-adapter には接続系（Origin・接続数上限・ハートビート・httpHandler）の
 * テストはあったが、**メッセージ経路（サイズ制限・JSON 不正・スキーマ不正・
 * ハンドラ例外）を実際に叩くテストが 1 つも無かった**。
 * `error-code-coverage.test.ts` はソースを走査するメタテストで、
 * 「そのコードに表示文言が決まっているか」は見るが、
 * 「アダプタが実際にそのコードを送るか」は検証していない。
 *
 * S5（#20）で境界のパースを @tasuki/protocol へ切り出すにあたり、この経路が
 * 無防備なままでは切り出しの正しさを確かめられないため先に足した。
 *
 * @requirements FR-013, NFRセキュリティ(S3)
 */

import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

// ポートは OS に選ばせる（`port: 0`）。実ポートは `adapter.port` から取る。
let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

/** 最初に届いたテキストメッセージを JSON として返す。 */
function waitMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once("message", (raw: Buffer) => resolve(JSON.parse(raw.toString())));
  });
}

interface Options {
  onMessage?: (connId: string, msg: unknown) => Promise<void>;
}

/** アダプタを `port: 0` で起動する。接続先 URL は `adapterUrl()` から取る。 */
function startAdapter(options: Options = {}): void {
  adapter = new WsAdapter({
    port: 0,
    host: "127.0.0.1",
    allowedOrigins: [],
    onMessage: options.onMessage ?? (async () => {}),
    onDisconnect: () => {},
  });
}

function adapterUrl(): string {
  return `ws://127.0.0.1:${adapter!.port}`;
}

async function connect(options: Options = {}): Promise<WebSocket> {
  startAdapter(options);
  const ws = new WebSocket(adapterUrl());
  await waitOpen(ws);
  return ws;
}

describe("WsAdapter メッセージ経路", () => {
  it("Given 接続済み / When 64KB を超える本文を送る / Then MESSAGE_TOO_LARGE を返し接続は保つ", async () => {
    // Given
    const ws = await connect();

    // When: 64KB 超（境界の外側）
    ws.send("x".repeat(64 * 1024 + 1));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "MESSAGE_TOO_LARGE" });
    expect(ws.readyState).toBe(WebSocket.OPEN); // 切らずに返す
    ws.close();
  });

  it("Given 接続済み / When 文字数は上限内だがバイト数が 64KB を超える本文を送る / Then MESSAGE_TOO_LARGE を返す", async () => {
    // Given
    const ws = await connect();

    // When: 日本語は UTF-8 で 1 文字 3 バイト。22,000 文字＝66,000 バイトで上限を超えるが、
    // 文字数（22,000）は上限（65,536）に満たない。**バイト数で測っていないと通ってしまう。**
    // Bun.serve はテキストフレームを string で渡すため、`raw.length` で測ると
    // ws 実装（Buffer.length）より制限が緩くなる。この 1 件がその退行を止める。
    ws.send("あ".repeat(22_000));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "MESSAGE_TOO_LARGE" });
    expect(ws.readyState).toBe(WebSocket.OPEN); // 切らずに返す
    ws.close();
  });

  it("Given 接続済み / When JSON として壊れた本文を送る / Then INVALID_JSON を返す", async () => {
    // Given
    const ws = await connect();

    // When
    ws.send("{ これは JSON ではない");
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "INVALID_JSON" });
    ws.close();
  });

  it("Given 接続済み / When JSON だがコマンド形式でない本文を送る / Then INVALID_COMMAND を返す", async () => {
    // Given
    const ws = await connect();

    // When: JSON としては妥当だが CommandSchema に合わない
    ws.send(JSON.stringify({ command: "存在しないコマンド" }));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "INVALID_COMMAND" });
    ws.close();
  });

  it("Given onMessage が失敗する / When 妥当なコマンドを送る / Then INTERNAL_ERROR を返す", async () => {
    // Given
    const ws = await connect({
      onMessage: async () => {
        throw new Error("意図的な失敗");
      },
    });

    // When
    ws.send(JSON.stringify({ command: "time.ping", clientTime: 1 }));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
    ws.close();
  });

  it("Given 妥当なコマンド / When 送る / Then 検証済みの値が onMessage へ渡る", async () => {
    // Given
    const received: unknown[] = [];
    const ws = await connect({
      onMessage: async (_connId, msg) => {
        received.push(msg);
      },
    });

    // When
    ws.send(JSON.stringify({ command: "time.ping", clientTime: 42 }));
    await new Promise((r) => setTimeout(r, 120));

    // Then
    expect(received).toEqual([{ command: "time.ping", clientTime: 42 }]);
    ws.close();
  });

  it("Given 2 つの接続 / When 片方の connId へ send する / Then その接続にだけ届く", async () => {
    // Given
    startAdapter();
    const connIds: string[] = [];
    const a = new WebSocket(adapterUrl());
    await waitOpen(a);
    const b = new WebSocket(adapterUrl());
    await waitOpen(b);
    // connId は接続順に振られる（conn-1, conn-2）
    connIds.push("conn-1", "conn-2");

    // When
    const gotA = waitMessage(a);
    let bGotSomething = false;
    b.once("message", () => {
      bGotSomething = true;
    });
    adapter.send(connIds[0]!, { type: "hello" });

    // Then
    expect(await gotA).toEqual({ type: "hello" });
    await new Promise((r) => setTimeout(r, 80));
    expect(bGotSomething).toBe(false);
    a.close();
    b.close();
  });

  it("Given 2 つの接続 / When broadcast する / Then 両方に届く", async () => {
    // Given
    startAdapter();
    const a = new WebSocket(adapterUrl());
    await waitOpen(a);
    const b = new WebSocket(adapterUrl());
    await waitOpen(b);

    // When
    const gotA = waitMessage(a);
    const gotB = waitMessage(b);
    adapter.broadcast(["conn-1", "conn-2"], { type: "broadcast" });

    // Then
    expect(await gotA).toEqual({ type: "broadcast" });
    expect(await gotB).toEqual({ type: "broadcast" });
    a.close();
    b.close();
  });
});
