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
