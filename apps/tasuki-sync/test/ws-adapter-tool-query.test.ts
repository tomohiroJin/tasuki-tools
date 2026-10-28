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
import { collectingLogger, testLogger } from "./support/test-logger.js";
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
 *
 * @requirements #91 spec §5.3
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
      timer: { handleMessage: async () => {} },
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
      const [connId, rateKey] = connectCalls[0]!;
      // deriveClientKey を配線していない（XFF も無い）ので、rateKey は connId にフォールバックする
      // （`ws-adapter.client-key.test.ts` の「X-Forwarded-For が無ければ connId が鍵になる」と同じ形）。
      expect(rateKey).toBe(connId);
      expect(disconnectCalls).toEqual([connId]);
    } finally {
      await adapter.close();
    }
  });
});

/**
 * ルーレットの接続は専用のメッセージ層だけへ届き、timer・ハブ・お題の層へは届かない（#94・spec §5.2）。
 * さらに **poker の早期 return を通らない**（お題と同じ。`onConnect` の鍵が接続 ID に落ちて
 * 参加の総当たりが張り直しで枠を回避できるのを防ぐ）。
 *
 * @requirements #94 E9
 */
describe("ルーレット（?tool=roulette）の接続の振り分け", () => {
  it("Given ?tool=roulette の接続 / When 生テキストを送る / Then ルーレットの層にだけ届き、timer・ハブ・お題の層へは届かない", async () => {
    // Given: 4 つの層をそれぞれ記録する低レベルの WsAdapter
    const calls = { roulette: [] as string[], timer: 0, hub: 0, topic: 0 };
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {
        calls.timer++;
      } },
      hub: { handleMessage: async () => {
        calls.hub++;
      } },
      topic: { handleMessage: async () => {
        calls.topic++;
      } },
      roulette: { handleMessage: async (_connId, raw) => {
        calls.roulette.push(raw);
      } },
      onDisconnect: () => {},
      logger: testLogger,
    });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=roulette`);
      await waitOpen(ws);

      // When
      ws.send("ルーレットのテキスト");
      await waitForCondition(() => calls.roulette.length > 0);

      // Then
      expect(calls.roulette).toEqual(["ルーレットのテキスト"]);
      expect([calls.timer, calls.hub, calls.topic]).toEqual([0, 0, 0]);
      ws.close();
    } finally {
      await adapter.close();
    }
  });

  it("Given ?tool=roulette で繋ぐ / When 受理されてから閉じる / Then 受理と切断が 1 回ずつ通知される（接続 ID と鍵つき）", async () => {
    // Given
    const connectCalls: Array<[string, string]> = [];
    const disconnectCalls: string[] = [];
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      onConnect: (connId, rateKey) => connectCalls.push([connId, rateKey]),
      onDisconnect: (connId) => disconnectCalls.push(connId),
      logger: testLogger,
    });
    try {
      // When
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=roulette`);
      await waitOpen(ws);
      ws.close();
      await waitForCondition(() => disconnectCalls.length > 0);

      // Then: poker のように手前で return していれば、この 2 つはどちらも呼ばれない
      expect(connectCalls.length).toBe(1);
      expect(disconnectCalls).toEqual([connectCalls[0]![0]]);
    } finally {
      await adapter.close();
    }
  });
});

/**
 * 進行タイマーの接続は専用のメッセージ層だけへ届き、timer・ハブ・ルーレットの層へは届かない（#429）。
 *
 * @requirements #429
 */
describe("進行タイマー（?tool=agenda）の接続の振り分け", () => {
  it("Given ?tool=agenda の接続 / When 生テキストを送る / Then agenda の層にだけ届き、timer・ハブ・ルーレットの層へは届かない", async () => {
    // Given
    const calls = { agenda: [] as string[], timer: 0, hub: 0, roulette: 0 };
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {
        calls.timer++;
      } },
      hub: { handleMessage: async () => {
        calls.hub++;
      } },
      roulette: { handleMessage: async () => {
        calls.roulette++;
      } },
      agenda: { handleMessage: async (_connId, raw) => {
        calls.agenda.push(raw);
      } },
      onDisconnect: () => {},
      logger: testLogger,
    });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=agenda`);
      await waitOpen(ws);

      // When
      ws.send("進行のテキスト");
      await waitForCondition(() => calls.agenda.length > 0);

      // Then
      expect(calls.agenda).toEqual(["進行のテキスト"]);
      expect([calls.timer, calls.hub, calls.roulette]).toEqual([0, 0, 0]);
      ws.close();
    } finally {
      await adapter.close();
    }
  });

  it("Given ?tool=agenda で繋ぐ / When 受理されてから閉じる / Then 受理と切断が 1 回ずつ通知される（接続 ID と鍵つき）", async () => {
    // Given
    const connectCalls: Array<[string, string]> = [];
    const disconnectCalls: string[] = [];
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      onConnect: (connId, rateKey) => connectCalls.push([connId, rateKey]),
      onDisconnect: (connId) => disconnectCalls.push(connId),
      logger: testLogger,
    });
    try {
      // When
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=agenda`);
      await waitOpen(ws);
      ws.close();
      await waitForCondition(() => disconnectCalls.length > 0);

      // Then
      expect(connectCalls.length).toBe(1);
      expect(disconnectCalls).toEqual([connectCalls[0]![0]]);
    } finally {
      await adapter.close();
    }
  });
});

/**
 * チェックインの接続は専用のメッセージ層だけへ届き、timer・ハブ・ルーレット・進行タイマーの層へは届かない（#406）。
 *
 * @requirements #406
 */
describe("チェックイン（?tool=checkin）の接続の振り分け", () => {
  it("Given ?tool=checkin の接続 / When 生テキストを送る / Then checkin の層にだけ届き、timer・ハブ・ルーレット・agenda の層へは届かない", async () => {
    // Given
    const calls = { checkin: [] as string[], timer: 0, hub: 0, roulette: 0, agenda: 0 };
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {
        calls.timer++;
      } },
      hub: { handleMessage: async () => {
        calls.hub++;
      } },
      roulette: { handleMessage: async () => {
        calls.roulette++;
      } },
      agenda: { handleMessage: async () => {
        calls.agenda++;
      } },
      checkin: { handleMessage: async (_connId, raw) => {
        calls.checkin.push(raw);
      } },
      onDisconnect: () => {},
      logger: testLogger,
    });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=checkin`);
      await waitOpen(ws);

      // When
      ws.send("札のテキスト");
      await waitForCondition(() => calls.checkin.length > 0);

      // Then
      expect(calls.checkin).toEqual(["札のテキスト"]);
      expect([calls.timer, calls.hub, calls.roulette, calls.agenda]).toEqual([0, 0, 0, 0]);
      ws.close();
    } finally {
      await adapter.close();
    }
  });

  it("Given ?tool=checkin で繋ぐ / When 受理されてから閉じる / Then 受理と切断が 1 回ずつ通知される（接続 ID と鍵つき）", async () => {
    // Given
    const connectCalls: Array<[string, string]> = [];
    const disconnectCalls: string[] = [];
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      onConnect: (connId, rateKey) => connectCalls.push([connId, rateKey]),
      onDisconnect: (connId) => disconnectCalls.push(connId),
      logger: testLogger,
    });
    try {
      // When
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=checkin`);
      await waitOpen(ws);
      ws.close();
      await waitForCondition(() => disconnectCalls.length > 0);

      // Then
      expect(connectCalls.length).toBe(1);
      expect(disconnectCalls).toEqual([connectCalls[0]![0]]);
    } finally {
      await adapter.close();
    }
  });
});

/**
 * poker の接続の受理と切断（#368 Task 1）。
 *
 * poker は受理のフックを持たず（レート制限の鍵は `ws.data.rateKey` から直接読む）、切断の後始末は
 * メッセージ層の `detachFromCurrentRoom` が持つ。**`onConnect` / `onDisconnect` はどちらも呼ばない**。
 * 後始末が throw しても、ログを残してプロセスは落ちない（他のツールの切断と同じ隔離）。
 */
describe("poker の接続の受理と切断", () => {
  it("Given ?tool=poker で繋ぐ / When 受理されてから閉じる / Then onConnect・onDisconnect は呼ばれず、detachFromCurrentRoom が 1 回呼ばれる", async () => {
    // Given
    const connectCalls: string[] = [];
    const disconnectCalls: string[] = [];
    const detached: string[] = [];
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      onConnect: (connId) => connectCalls.push(connId),
      onDisconnect: (connId) => disconnectCalls.push(connId),
      poker: {
        dispatch: () => {},
        sendError: () => {},
        detachFromCurrentRoom: (conn) => {
          detached.push(conn.data.rateKey);
        },
      },
      logger: testLogger,
    });

    try {
      // When
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=poker`);
      await waitOpen(ws);
      ws.close();
      await waitForCondition(() => detached.length > 0);

      // Then: 鍵は配線していないので接続 ID に落ちる
      expect(detached).toEqual(["conn-1"]);
      expect(connectCalls).toEqual([]);
      expect(disconnectCalls).toEqual([]);
    } finally {
      await adapter.close();
    }
  });

  it("Given 切断の後始末が throw する poker の層 / When 閉じる / Then on-disconnect-error を 1 行残し、次の接続を受け付けられる", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    const adapter: WsAdapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      timer: { handleMessage: async () => {} },
      onDisconnect: () => {},
      poker: {
        dispatch: () => {},
        sendError: () => {},
        detachFromCurrentRoom: () => {
          throw new TypeError("後始末の失敗（テスト用）");
        },
      },
      logger,
    });

    try {
      // When
      const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=poker`);
      await waitOpen(ws);
      ws.close();
      await waitForCondition(() => lines.length > 0);

      // Then
      expect(lines).toEqual(["on-disconnect-error name=TypeError"]);
      const next = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
      await waitOpen(next);
      next.close();
    } finally {
      await adapter.close();
    }
  });
});
