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
import { parseClientMessage } from "@tasuki/poker-core";

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
    timer: { handleMessage: options.onMessage ?? (async () => {}) },
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
      timer: { handleMessage: () => {
        throw new Error("sync boom");
      } },
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
    expect(lines.find((line) => line.startsWith("on-message-error"))!).toContain("protocol=timer");
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
 * ハブ・timer と同じ接続層を通るが、メッセージ層は分かれている（`topic.handleMessage`）。
 * ここでは「お題の接続へ送った生テキストは `topic.handleMessage` にだけ届く（`timer.handleMessage` /
 * `hub.handleMessage` には届かない）」ことと、「64KB を超えるとサイズ超過のエラーを返し、
 * 接続は保つ」ことを確かめる。サイズ判定・エラーコード（`MESSAGE_TOO_LARGE`）は
 * ハブと同じ受け口の定義（`ws/tool-channel.ts` の `createTextChannel`）から作る。
 *
 * @requirements #91 spec §5.3
 */
describe("WsAdapter お題（topic）のメッセージ経路", () => {
  /** `?tool=topic` で接続する URL。 */
  function topicUrl(adapterInstance: WsAdapter): string {
    return `ws://127.0.0.1:${adapterInstance.port}/ws?tool=topic`;
  }

  it("Given ?tool=topic の接続 / When 生テキストを送る / Then お題の層に届き、timer とハブの層には届かない", async () => {
    // Given
    const topicCalls: Array<[string, string]> = [];
    let messageCalled = false;
    let hubCalled = false;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {
        messageCalled = true;
      } },
      hub: { handleMessage: async () => {
        hubCalled = true;
      } },
      topic: { handleMessage: async (connId, raw) => {
        topicCalls.push([connId, raw]);
      } },
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

  it("Given ?tool=topic の接続 / When 64KB を超える本文を送る / Then お題の層は呼ばれず MESSAGE_TOO_LARGE を返し接続は保つ", async () => {
    // Given
    let topicCalled = false;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      topic: { handleMessage: async () => {
        topicCalled = true;
      } },
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
 * ハブ（選択画面）のメッセージ層が同期 throw しても隔離される（#91 PR 3 Task 5）。
 *
 * `hub.handleMessage` は型上 `Promise<void>` を返す契約だが、実装が async でなければ
 * 同期的に throw しうる（型は実行時の保証にはならない。`.catch` は reject しか拾わない）。
 * **以前は `handleHubMessage` がこの呼び出しを `.catch()` でしか包んでおらず、同期 throw を
 * 隔離する try/catch を持たなかった**（`handleTopicMessage` の docstring に既知の差分として
 * 記されていた）。#91 PR 3 でここに `handleTopicMessage` と同じ形の try/catch を足して
 * 隔離した（#368 からは、4 つの受け口が `ws/tool-channel.ts` の `createTextChannel` 1 つを通る）
 * —— 隔離が無いと、ここでの同期 throw が Bun の websocket ハンドラを抜けて
 * `uncaughtException` に達し、`server.ts` の `process.exit(1)` で**同じプロセスに載る
 * timer / poker / お題のルームも道連れで消える**（揮発インメモリ）。
 *
 * ハブは poker（1011 で接続を閉じる）と違い、お題と同じくエラーフレーム
 * （`INTERNAL_ERROR`）を返して**接続を保つ**契約なので、ここではそれを確かめたうえで、
 * 同じ接続で次のメッセージが実際にハンドラへ届くこと・同じアダプタで新しい接続も
 * 張れること（＝サーバーが生きていること）まで確認する。
 *
 * @requirements #91 PR 3 Task 5
 */
describe("ハブ（選択画面）のメッセージ層が同期 throw しても隔離される", () => {
  it("throw は on-message-error として記録され、INTERNAL_ERROR フレームを返して接続もサーバーも生き残る", async () => {
    // Given: 最初の 1 通だけ同期 throw する onHubMessage
    const { logger, lines } = collectingLogger();
    let calls = 0;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      hub: { handleMessage: (_connId: string, _raw: string): Promise<void> => {
        calls++;
        if (calls === 1) {
          throw new Error("boom in onHubMessage");
        }
        return Promise.resolve();
      } },
      onDisconnect: () => {},
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws`);
    await waitOpen(ws);

    try {
      // When: 1 通目を送る（onHubMessage が同期 throw する）
      ws.send("1通目");
      const msg = await waitMessage(ws);

      // Then: エラーフレームが返る（poker と違い接続は切らない）
      expect(msg).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
      // Then: 例外の分類だけが記録される（例外メッセージは載せない・ADR 0012 D3）
      await waitFor(() => lines.some((l) => l.startsWith("on-message-error ")));
      const line = lines.find((l) => l.startsWith("on-message-error "))!;
      expect(line).toContain("name=");
      expect(line).toContain("protocol=hub");
      expect(line).not.toContain("boom in onHubMessage");

      // Then: 接続は保たれる
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Then: 同じ接続で 2 通目を送るとハンドラへ実際に届く（サーバーが生きて動き続ける）
      ws.send("2通目");
      await waitFor(() => calls === 2);
      expect(calls).toBe(2);

      // Then: 同じアダプタで新しい接続も張れる（プロセス全体は落ちていない）
      const second = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws`);
      await waitOpen(second);
      expect(second.readyState).toBe(WebSocket.OPEN);
      second.close();
    } finally {
      ws.close();
    }
  });
});

/**
 * お題（topic）のメッセージ層が同期 throw しても隔離される（#91 fix round 1）。
 *
 * `topic.handleMessage` は型上 `Promise<void>` を返す契約だが、実装が async でなければ
 * 同期的に throw しうる（型は実行時の保証にはならない）。受け口（`ws/tool-channel.ts` の
 * `createTextChannel`。#368 までは `handleTopicMessage`）がこの呼び出しを try/catch で囲んでいなければ、ここでの throw は Bun の websocket
 * ハンドラを抜けて `uncaughtException` に達し、`server.ts` の `process.exit(1)` で
 * **同じプロセスに載る timer / poker / ハブのルームも道連れで消える**（揮発インメモリ）。
 *
 * poker（1011 で接続を閉じる）と違い、お題はエラーフレーム（`INTERNAL_ERROR`）を
 * 返して**接続を保つ**契約なので、ここではそれを確かめたうえで、同じ接続で
 * 次のメッセージが実際にハンドラへ届くこと・同じアダプタで新しい接続も張れること
 * （＝サーバーが生きていること）まで確認する。
 *
 * @requirements #91 spec §5.3
 */
describe("お題（topic）のメッセージ層が同期 throw しても隔離される", () => {
  it("throw は on-message-error として記録され、INTERNAL_ERROR フレームを返して接続もサーバーも生き残る", async () => {
    // Given: 最初の 1 通だけ同期 throw する onTopicMessage
    const { logger, lines } = collectingLogger();
    let calls = 0;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      topic: { handleMessage: (_connId: string, _raw: string): Promise<void> => {
        calls++;
        if (calls === 1) {
          throw new Error("boom in onTopicMessage");
        }
        return Promise.resolve();
      } },
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
      expect(line).toContain("protocol=topic");
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
 * ルーレットのメッセージ経路（#94）。お題（topic）と同じ形で、サイズ超過は
 * `MESSAGE_TOO_LARGE`、メッセージ層の同期 throw は `INTERNAL_ERROR` を返して接続を保つ。
 *
 * @requirements #94 spec §5.2・E15
 */
describe("WsAdapter ルーレットのメッセージ経路", () => {
  it("Given ?tool=roulette の接続 / When 64KB を超える本文を送る / Then ルーレットの層へ渡さず MESSAGE_TOO_LARGE を返し接続は保つ", async () => {
    // Given
    let called = false;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      roulette: { handleMessage: async () => {
        called = true;
      } },
      onDisconnect: () => {},
      logger: testLogger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=roulette`);
    await waitOpen(ws);

    // When: 64KB 超（境界の外側）
    ws.send("x".repeat(64 * 1024 + 1));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "MESSAGE_TOO_LARGE" });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(called).toBe(false);
    ws.close();
  });

  it("Given 最初の 1 通だけ同期 throw するルーレットの層 / When 2 通送る / Then INTERNAL_ERROR を返し、接続もプロセスも落ちず 2 通目が届く", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    let calls = 0;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      roulette: { handleMessage: (_connId: string, _raw: string): Promise<void> => {
        calls++;
        if (calls === 1) throw new Error("boom in onRouletteMessage");
        return Promise.resolve();
      } },
      onDisconnect: () => {},
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=roulette`);
    await waitOpen(ws);
    try {
      // When
      ws.send("1通目");
      const msg = await waitMessage(ws);

      // Then: エラーフレームが返り、例外の分類だけが記録される（例外メッセージは載せない）
      expect(msg).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
      await waitFor(() => lines.some((l) => l.startsWith("on-message-error ")));
      expect(lines.find((l) => l.startsWith("on-message-error "))!).not.toContain("boom in onRouletteMessage");
      expect(lines.find((l) => l.startsWith("on-message-error "))!).toContain("protocol=roulette");
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Then: 2 通目がハンドラへ届き、新しい接続も張れる
      ws.send("2通目");
      await waitFor(() => calls === 2);
      const second = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=roulette`);
      await waitOpen(second);
      expect(second.readyState).toBe(WebSocket.OPEN);
      second.close();
    } finally {
      ws.close();
    }
  });
});

/**
 * 進行タイマーのメッセージ経路（#429）。ルーレットと同じ形で、サイズ超過は
 * `MESSAGE_TOO_LARGE`、メッセージ層の同期 throw は `INTERNAL_ERROR` を返して接続を保つ。
 *
 * @requirements #429
 */
describe("WsAdapter 進行タイマーのメッセージ経路", () => {
  it("Given ?tool=agenda の接続 / When 64KB を超える本文を送る / Then agenda の層へ渡さず MESSAGE_TOO_LARGE を返し接続は保つ", async () => {
    // Given
    let called = false;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      agenda: { handleMessage: async () => {
        called = true;
      } },
      onDisconnect: () => {},
      logger: testLogger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=agenda`);
    await waitOpen(ws);

    // When: 64KB 超（境界の外側）
    ws.send("x".repeat(64 * 1024 + 1));
    const msg = await waitMessage(ws);

    // Then
    expect(msg).toMatchObject({ type: "error", code: "MESSAGE_TOO_LARGE" });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(called).toBe(false);
    ws.close();
  });

  it("Given 最初の 1 通だけ同期 throw する agenda の層 / When 2 通送る / Then INTERNAL_ERROR を返し、接続もプロセスも落ちず 2 通目が届く", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    let calls = 0;
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      agenda: { handleMessage: (_connId: string, _raw: string): Promise<void> => {
        calls++;
        if (calls === 1) throw new Error("boom in onAgendaMessage");
        return Promise.resolve();
      } },
      onDisconnect: () => {},
      logger,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=agenda`);
    await waitOpen(ws);
    try {
      // When
      ws.send("1通目");
      const msg = await waitMessage(ws);

      // Then: エラーフレームが返り、例外の分類だけが記録される（例外メッセージは載せない）
      expect(msg).toMatchObject({ type: "error", code: "INTERNAL_ERROR" });
      await waitFor(() => lines.some((l) => l.startsWith("on-message-error ")));
      expect(lines.find((l) => l.startsWith("on-message-error "))!).not.toContain("boom in onAgendaMessage");
      expect(lines.find((l) => l.startsWith("on-message-error "))!).toContain("protocol=agenda");
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Then: 2 通目がハンドラへ届き、新しい接続も張れる
      ws.send("2通目");
      await waitFor(() => calls === 2);
      const second = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=agenda`);
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
      timer: { handleMessage: async () => {} },
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
      expect(line).toContain("protocol=poker");
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

/**
 * ハブ・お題・ルーレットへの送り出し（#368 Task 1）。
 *
 * timer の `send` / `broadcast` は上で固定してある。残りの 3 組は実 WS 越しのテストが間接に
 * 使っているだけだったので、同じ形で直接固定する。**宛先にだけ届き、知らない接続 ID は黙って飛ばす。**
 */
describe("ハブ・お題・ルーレットへの送り出し", () => {
  /** 3 つのどの型にも収まるフレーム（`HubServerMsg` の error は 3 つの合併に含まれる）。 */
  const frame = { type: "error", code: "TEST_ONLY", message: "テスト用" } as const;

  for (const [label, send, broadcast] of [
    ["ハブ", (a: WsAdapter, id: string) => a.sendHub(id, frame), (a: WsAdapter, ids: string[]) => a.broadcastHub(ids, frame)],
    ["お題", (a: WsAdapter, id: string) => a.sendTopic(id, frame), (a: WsAdapter, ids: string[]) => a.broadcastTopic(ids, frame)],
    [
      "ルーレット",
      (a: WsAdapter, id: string) => a.sendRoulette(id, frame),
      (a: WsAdapter, ids: string[]) => a.broadcastRoulette(ids, frame),
    ],
    [
      "進行タイマー",
      (a: WsAdapter, id: string) => a.sendAgenda(id, frame),
      (a: WsAdapter, ids: string[]) => a.broadcastAgenda(ids, frame),
    ],
  ] as const) {
    it(`Given 3 つの接続 / When ${label}へ 1 本に送り、2 本と知らない ID へ一斉に送る / Then 宛先にだけ 1 通ずつ届く`, async () => {
      // Given: conn-1・conn-2・conn-3（接続の順に振られる）
      startAdapter();
      const sockets = [new WebSocket(adapterUrl()), new WebSocket(adapterUrl()), new WebSocket(adapterUrl())];
      for (const ws of sockets) await waitOpen(ws);
      const received: number[] = [0, 0, 0];
      sockets.forEach((ws, i) => ws.on("message", () => received[i]!++));

      // When
      send(adapter!, "conn-2");
      broadcast(adapter!, ["conn-1", "conn-99", "conn-3"]);

      // Then
      await waitFor(() => received.reduce((a, b) => a + b, 0) >= 3);
      await new Promise((r) => setTimeout(r, 80));
      expect(received).toEqual([1, 1, 1]);
      for (const ws of sockets) ws.close();
    });
  }
});

/**
 * フレームの上限（`maxFrameBytes` = `Bun.serve` の `maxPayloadLength`）を超えたとき（#368 Task 1）。
 *
 * アプリの上限（`maxMessageBytes`）を超えても上限内なら、エラーフレームを返して接続を保つ（上のテスト）。
 * フレームの上限を超えると、**メッセージ層へ届く前に Bun が接続を切る**。閉じ方をここで固定する
 * （2026-10-13 に Bun 1.4 で実測: クライアントには 1006（close フレームの無い切断）として見える。
 * `ws-adapter.ts` の `maxPayloadLength` のコメントにある「1006 切断」と同じ）。
 */
describe("フレームの上限を超えたとき", () => {
  it("Given 既定の上限（128KB） / When それを超えるフレームを送る / Then 1006 で切れ、メッセージ層は呼ばれない", async () => {
    // Given
    let called = false;
    const ws = await connect({
      onMessage: async () => {
        called = true;
      },
    });
    const closed = new Promise<number>((resolve) => ws.once("close", (code: number) => resolve(code)));
    // When
    ws.send("x".repeat(128 * 1024 + 1));
    // Then
    expect(await closed).toBe(1006);
    expect(called).toBe(false);
  });
});

/**
 * poker の解析の失敗（#368 Task 1）。接続層は `parseClientMessage` の失敗を、
 * そのコードと文言のまま `sendError` へ渡す（エラーフレームの形は poker のメッセージ層が持つ）。
 */
describe("poker の解析の失敗", () => {
  for (const [label, raw] of [
    ["壊れた JSON", "{ 壊れている"],
    ["知らない種類", JSON.stringify({ type: "no-such-type" })],
  ] as const) {
    it(`Given poker の接続 / When ${label}を送る / Then 解析の失敗のコードと文言で sendError を 1 回呼び、dispatch は呼ばない`, async () => {
      // Given
      const errors: Array<[string, string]> = [];
      let dispatched = false;
      adapter = newTestWsAdapter({
        port: 0,
        host: "127.0.0.1",
        allowedOrigins: [],
        timer: { handleMessage: async () => {} },
        onDisconnect: () => {},
        logger: testLogger,
        poker: {
          dispatch: () => {
            dispatched = true;
          },
          sendError: (_conn, code, message) => {
            errors.push([code, message]);
          },
          detachFromCurrentRoom: () => {},
        },
      });
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=poker`);
      await waitOpen(ws);
      // When
      ws.send(raw);
      await waitFor(() => errors.length > 0);
      // Then
      const expected = parseClientMessage(raw)._unsafeUnwrapErr();
      expect(errors).toEqual([[expected.code, expected.message]]);
      expect(dispatched).toBe(false);
      ws.close();
    });
  }
});
