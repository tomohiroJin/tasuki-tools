/**
 * 接続 URL のクエリでツールを宣言する（#95 S5c・#249）。
 *
 * 入口は `/ws` の 1 本だけで、振り分けは接続 URL のクエリ（`?tool=`）だけで決まる
 * （`src/adapters/ws-adapter.ts` の `protocolFromRequestUrl`）。旧パス
 * （`/timer/ws`・`/poker/ws`）による振り分けは Task 5 で撤去した。
 *
 * 判別の仕方は同じ 1 つのメッセージ（poker の `create-room`）を送り、
 * **どちらのプロトコルが答えたか**で判定する。timer の `CommandSchema` はこれを
 * 知らないので `INVALID_COMMAND` を返し、poker は `joined` を返す。両者の応答は
 * 形も語彙も重ならないため、取り違えを空振りではなく赤で検出できる。
 *
 * **`?tool=timer` の対照も持つ**（Task 5 のレビューで指摘。#249）。
 * `?tool=poker` → poker と `?tool=unknown` → 1008 だけでは、`?tool=timer` が
 * 誤って hub へ落ちても（`participantId`/`roomId` が無いことしか見ない
 * `ws-adapter-connection-data.test.ts` は hub と区別できないため）緑のまま通ってしまう。
 * `time.ping` は timer のメッセージ層だけが `time.pong` で答える唯一のコマンドなので、
 * これで `?tool=timer` が実際に timer の層へ届いていることと、`?tool=` 無しでは
 * 届かない（hub へ落ちる）ことの両方を対照で固定する。
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { loadSyncConfig } from "../src/config.js";
import { createSyncServer, type SyncServer } from "../src/create-sync-server.js";
import { newTestWsAdapter } from "./support/test-ws-adapter.js";
import { testLogger } from "./support/test-logger.js";
import type { WsAdapter } from "../src/adapters/ws-adapter.js";

let server: SyncServer;

beforeAll(() => {
  server = createSyncServer(loadSyncConfig({ PORT: "0" }));
});

afterAll(async () => {
  await server.close();
});

/** close イベント（code）を待つ。 */
function closeCodeOf(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.addEventListener("close", (event) => resolve(event.code), { once: true });
  });
}

/** open イベントを待つ。 */
function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("接続できない")), { once: true });
  });
}

/** 条件が満たされるまで短い間隔でポーリングする（固定 sleep によるフレーキー回避）。 */
async function waitForCondition(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`waitForCondition: ${timeoutMs}ms 待ったが条件を満たさなかった`);
    }
    await Bun.sleep(5);
  }
}

/**
 * `url` へ繋ぎ、poker の `create-room` を 1 通投げて最初の応答が `joined` であることを
 * 確かめる。timer のメッセージ層へ落ちていれば `INVALID_COMMAND` になり、
 * ハブへ落ちていれば `create-room` を知らないので、どちらでも `joined` にはならない。
 */
async function expectPokerLayerReceives(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("接続できない")), { once: true });
  });
  const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("応答が来ない")), 5_000);
    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      },
      { once: true },
    );
  });
  ws.send(JSON.stringify({ type: "create-room", name: "たろう" }));
  const msg = await reply;
  expect(msg["type"]).toBe("joined");
}

/**
 * timer のメッセージ層だけが答える唯一のコマンド（`time.ping` → `time.pong`）。
 * hub は名簿の語彙（room.create / room.join / roster）しか話さないので、
 * これを送っても hub は知らないコマンドとして拒む（`time.pong` にはならない）。
 */
const TIMER_ONLY_COMMAND = { command: "time.ping", clientTime: 1 };

/** `url` へ繋ぎ、`TIMER_ONLY_COMMAND` を 1 通投げて最初の応答を返す。 */
async function firstReplyTo(ws: WebSocket): Promise<Record<string, unknown>> {
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("接続できない")), { once: true });
  });
  const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("応答が来ない")), 5_000);
    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      },
      { once: true },
    );
  });
  ws.send(JSON.stringify(TIMER_ONLY_COMMAND));
  return await reply;
}

describe("接続 URL のクエリでツールを宣言する", () => {
  it("Given ?tool=poker で繋ぐ / When poker のコマンドを送る / Then poker の層が受ける", async () => {
    // Given: `/ws?tool=poker` で接続する
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?tool=poker`);

    try {
      // When / Then: poker のメッセージ層が受け、INVALID_COMMAND にならない
      await expectPokerLayerReceives(ws);
    } finally {
      ws.close();
    }
  });

  it("Given ?tool=unknown-tool で繋ぐ / When 接続が開く / Then 1008 で閉じられる", async () => {
    // Given: 許可リストに無いツール名
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?tool=unknown-tool`);

    // When / Then: 受け入れず、理由つきで閉じる（timer へもハブへも落とさない）
    const code = await closeCodeOf(ws);
    expect(code).toBe(1008);
  });

  it("Given ?tool=timer で繋ぐ / When time.ping を送る / Then time.pong が返る（timer の層が受ける）", async () => {
    // Given: `/ws?tool=timer` で接続する
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?tool=timer`);

    try {
      // When: timer だけが答えるコマンドを送る
      const reply = await firstReplyTo(ws);

      // Then: timer の層が受けている（hub なら知らないコマンドとして拒む）
      expect(reply["type"]).toBe("time.pong");
    } finally {
      ws.close();
    }
  });

  it("Given ?tool= 無しで繋ぐ / When timer だけが答えるコマンドを送る / Then time.pong は返らない（対照。hub へ落ちている）", async () => {
    // Given: クエリを付けずに `/ws` へ接続する（＝ハブ）
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

    try {
      // When: 上のテストと同じコマンドを送る
      const reply = await firstReplyTo(ws);

      // Then: 上のテストの緑が「どこへ送っても time.pong が返る」空振りではないことを示す対照
      expect(reply["type"]).not.toBe("time.pong");
    } finally {
      ws.close();
    }
  });
});

/**
 * お題（topic）の接続は timer・ハブと同じ `onConnect` / `onDisconnect` を通る（#91・spec §5.3 の MUST）。
 *
 * **poker の早期 return を写していないことを見る。** `createSyncServer` はまだお題の
 * ハンドラを配線していない（Task 9）ため、ここは低レベルの `WsAdapter` を
 * `newTestWsAdapter` で直接組み立て、`onConnect` / `onDisconnect` を自前の記録役へ差し替える。
 */
describe("お題（topic）の接続は poker の早期 return を通らない", () => {
  it("Given ?tool=topic で繋ぐ / When 受理されてから閉じる / Then onConnect が (connId, rateKey) で 1 回、onDisconnect が 1 回呼ばれる", async () => {
    // Given: onConnect / onDisconnect を記録する低レベルの WsAdapter
    const connectCalls: Array<[string, string]> = [];
    const disconnectCalls: string[] = [];
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onConnect: (connId, rateKey) => connectCalls.push([connId, rateKey]),
      onDisconnect: (connId) => disconnectCalls.push(connId),
      logger: testLogger,
    });

    try {
      // When: `?tool=topic` で繋いでから閉じる
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=topic`);
      await waitOpen(ws);
      ws.close();
      await waitForCondition(() => disconnectCalls.length > 0);

      // Then: poker のように手前で return していれば、この 2 つはどちらも呼ばれない
      expect(connectCalls.length).toBe(1);
      const [connId] = connectCalls[0]!;
      expect(disconnectCalls).toEqual([connId]);
    } finally {
      await adapter.close();
    }
  });
});
