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
import { newTestWsAdapter, unwiredPokerHandlers } from "./support/test-ws-adapter.js";
import { testLogger, collectingLogger } from "./support/test-logger.js";

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

/** 条件が満たされるまで短い間隔でポーリングする（固定 sleep によるフレーキー回避）。 */
async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: ${timeoutMs}ms 待ったが条件を満たさなかった`);
    }
    await Bun.sleep(5);
  }
}

interface Options {
  onMessage?: (connId: string, msg: unknown) => Promise<void>;
}

/** アダプタを `port: 0` で起動する。接続先 URL は `adapterUrl()` から取る。 */
function startAdapter(options: Options = {}): void {
  adapter = newTestWsAdapter({
    port: 0,
    host: "127.0.0.1",
    allowedOrigins: [],
    onMessage: options.onMessage ?? (async () => {}),
    onDisconnect: () => {},
    logger: testLogger,
  });
}

/** timer として接続する URL（入口は /ws の 1 本で、ツールはクエリが宣言する。#95 S5c）。 */
function adapterUrl(): string {
  return `ws://127.0.0.1:${adapter!.port}/ws?tool=timer`;
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

  it("Given onMessage が同期的に throw する / When 妥当なコマンドを送る / Then INTERNAL_ERROR を返し接続を保つ（I-5）", async () => {
    // Given: 型は `Promise<void>` を要求するが、実装が async ではなく同期的に throw する
    // ケース（型は実行時の保証にはならない。`.catch` は reject しか拾わない）。
    const ws = await connect({
      onMessage: () => {
        throw new Error("sync boom");
      },
    });

    // When
    ws.send(JSON.stringify({ command: "time.ping", clientTime: 1 }));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
    expect(ws.readyState).toBe(WebSocket.OPEN); // 切らずに返す
    ws.close();
  });

  it("Given onMessage が同期的に throw する / When 妥当なコマンドを送る / Then ログに on-message-error が記録される（I-5）", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: () => {
        throw new Error("sync boom");
      },
      onDisconnect: () => {},
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=timer`);
    await waitOpen(ws);

    // When
    ws.send(JSON.stringify({ command: "time.ping", clientTime: 1 }));
    await waitFor(() => lines.some((line) => line.startsWith("on-message-error")));

    // Then
    expect(lines.some((line) => line.startsWith("on-message-error"))).toBe(true);
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
    adapter!.send(connIds[0]!, { type: "time.pong", serverTime: 1 });

    // Then
    expect(await gotA).toEqual({ type: "time.pong", serverTime: 1 });
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
    adapter!.broadcast(["conn-1", "conn-2"], { type: "time.pong", serverTime: 2 });

    // Then
    expect(await gotA).toEqual({ type: "time.pong", serverTime: 2 });
    expect(await gotB).toEqual({ type: "time.pong", serverTime: 2 });
    a.close();
    b.close();
  });
});

/**
 * お題（topic）のメッセージ経路（#91）。
 *
 * ハブ・timer と同じ接続層を通るが、メッセージ層は分かれている（`onTopicMessage`）。
 * ここでは「お題の接続へ送った生テキストは `onTopicMessage` にだけ届く（`onMessage` /
 * `onHubMessage` には届かない）」ことと、「64KB を超えるとサイズ超過のエラーを返し、
 * 接続は保つ」ことを確かめる。サイズ判定・エラーコード（`MESSAGE_TOO_LARGE`）は
 * `handleHubMessage` と同じ形である。
 *
 * @requirements #91 spec §5.3
 */
describe("WsAdapter お題（topic）のメッセージ経路", () => {
  /** `?tool=topic` で接続する URL。 */
  function topicUrl(adapterInstance: WsAdapter): string {
    return `ws://127.0.0.1:${adapterInstance.port}/ws?tool=topic`;
  }

  it("Given ?tool=topic の接続 / When 生テキストを送る / Then onTopicMessage に届き、onMessage と onHubMessage には届かない", async () => {
    // Given
    const topicCalls: Array<[string, string]> = [];
    let messageCalled = false;
    let hubCalled = false;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {
        messageCalled = true;
      },
      onHubMessage: async () => {
        hubCalled = true;
      },
      onTopicMessage: async (connId, raw) => {
        topicCalls.push([connId, raw]);
      },
      onDisconnect: () => {},
      logger: testLogger,
    });
    const ws = new WebSocket(topicUrl(adapter));
    await waitOpen(ws);

    // When
    ws.send("お題のテキスト");
    await waitFor(() => topicCalls.length > 0);

    // Then
    expect(topicCalls).toEqual([["conn-1", "お題のテキスト"]]);
    expect(messageCalled).toBe(false);
    expect(hubCalled).toBe(false);
    ws.close();
  });

  it("Given ?tool=topic の接続 / When 64KB を超える本文を送る / Then onTopicMessage は呼ばれず MESSAGE_TOO_LARGE を返し接続は保つ", async () => {
    // Given
    let topicCalled = false;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onTopicMessage: async () => {
        topicCalled = true;
      },
      onDisconnect: () => {},
      logger: testLogger,
    });
    const ws = new WebSocket(topicUrl(adapter));
    await waitOpen(ws);

    // When: 64KB 超（境界の外側）
    ws.send("x".repeat(64 * 1024 + 1));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "MESSAGE_TOO_LARGE" });
    expect(ws.readyState).toBe(WebSocket.OPEN); // 切らずに返す
    expect(topicCalled).toBe(false);
    ws.close();
  });
});

/**
 * お題（topic）のメッセージ層が同期 throw しても隔離される（#91 fix round 1）。
 *
 * `onTopicMessage` は型上 `Promise<void>` を返す契約だが、実装が async でなければ
 * 同期的に throw しうる（型は実行時の保証にはならない）。`handleTopicMessage` が
 * この呼び出しを try/catch で囲んでいなければ、ここでの throw は Bun の websocket
 * ハンドラを抜けて `uncaughtException` に達し、`server.ts` の `process.exit(1)` で
 * **同じプロセスに載る timer / poker / ハブのルームも道連れで消える**（揮発インメモリ）。
 *
 * poker（1011 で接続を閉じる）と違い、お題はエラーフレーム（`INTERNAL_ERROR`）を
 * 返して**接続を保つ**契約なので、ここではそれを確かめたうえで、同じ接続で
 * 次のメッセージが実際にハンドラへ届くこと・同じアダプタで新しい接続も張れること
 * （＝サーバーが生きていること）まで確認する。
 *
 * @requirements #91 R18
 */
describe("お題（topic）のメッセージ層が同期 throw しても隔離される", () => {
  it("throw は on-message-error として記録され、INTERNAL_ERROR フレームを返して接続もサーバーも生き残る", async () => {
    // Given: 最初の呼び出しだけ同期 throw する onTopicMessage
    const { logger, lines } = collectingLogger();
    let calls = 0;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onTopicMessage: (_connId: string, _raw: string): Promise<void> => {
        calls++;
        if (calls === 1) {
          throw new Error("boom in onTopicMessage");
        }
        return Promise.resolve();
      },
      onDisconnect: () => {},
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=topic`);
    await waitOpen(ws);

    try {
      // When: 1 通目を送る（onTopicMessage が同期 throw する）
      ws.send("1通目");
      const msg = await waitMessage(ws);

      // Then: エラーフレームが返る（poker と違い接続は切らない）
      expect(msg).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
      // Then: 例外の分類だけが記録される（例外メッセージは載せない・ADR 0012 D3）
      await waitFor(() => lines.some((l) => l.startsWith("on-message-error ")));
      const line = lines.find((l) => l.startsWith("on-message-error "))!;
      expect(line).toContain("name=");
      expect(line).not.toContain("boom in onTopicMessage");

      // Then: 接続は保たれる
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Then: 同じ接続で 2 通目を送るとハンドラへ実際に届く（サーバーが生きて動き続ける）
      ws.send("2通目");
      await waitFor(() => calls === 2);
      expect(calls).toBe(2);

      // Then: 同じアダプタで新しい接続も張れる（プロセス全体は落ちていない）
      const second = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=topic`);
      await waitOpen(second);
      expect(second.readyState).toBe(WebSocket.OPEN);
      second.close();
    } finally {
      ws.close();
    }
  });
});

/**
 * poker のメッセージ層が throw してもプロセスを落とさない（#95 S2）。
 *
 * **統合でこの隔離の重みが変わった。** 統合前は poker のハンドラの同期 throw で
 * 死ぬのは poker のプロセスだけだったが、いまは同じ 1 プロセスに timer のルームも
 * 載っている（揮発インメモリなので、落ちれば timer の全ルームが消える）。
 * `server.ts` の `uncaughtException` ハンドラは `process.exit(1)` するので、
 * アダプタで受け止めていなければそこまで到達してしまう。
 *
 * ここで使う poker のハンドラは `unwiredPokerHandlers()`（呼ばれたら throw する偽物）で、
 * **`dispatch` に到達したこと自体**も同時に確かめている。
 */
describe("poker のメッセージ層が throw しても隔離される", () => {
  it("throw は on-message-error として記録され、接続もサーバーも生き残る", async () => {
    // Given: 呼ばれたら必ず throw する poker のメッセージ層
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      logger,
      poker: unwiredPokerHandlers(),
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=poker`);
    await waitOpen(ws);
    // close は送信の直後に来るので、送る前に待ち受けを張る
    const closedWith = new Promise<{ code: number }>((resolve) => {
      ws.once("close", (code: number) => resolve({ code }));
    });

    try {
      // When: poker の入口へ 1 通送る（ハンドラは throw する）
      ws.send(JSON.stringify({ type: "create-room", name: "たろう" }));

      // Then: 例外の分類だけが記録される（例外メッセージは載せない・ADR 0012 D3）
      await waitFor(() => lines.some((l) => l.startsWith("on-message-error ")));
      const line = lines.find((l) => l.startsWith("on-message-error "))!;
      expect(line).toContain("name=");
      expect(line).not.toContain("poker のメッセージ層");

      // Then: **この接続だけ**が 1011 で閉じる（黙って開いたままにはしない。
      // poker-web にコマンド単位のタイムアウトが無く、応答も切断も無ければ
      // 画面が永久に待つため）
      const closed = await closedWith;
      expect(closed.code).toBe(1011);

      // Then: サーバー自体は生きていて、次の接続を受け付ける
      const second = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=poker`);
      await waitOpen(second);
      expect(second.readyState).toBe(WebSocket.OPEN);
      second.close();
    } finally {
      ws.close();
    }
  });
});
