/**
 * 接続層のエラーの文言を、wire の上で固定する特性テスト（#362 Task 1）。
 *
 * 接続層のエラー（JSON が壊れている・コマンドの形が不正・大きすぎる・内部エラー）は、
 * どの接続の種類でも同じ意味・同じ文言で返す契約である。ところが既存のテストは
 * **`code` しか見ていなかった**（`ws-adapter.message.test.ts` の `toMatchObject({ code })`）。
 * 文言を 1 か所へ集める（#362 Task 2）前に、いまの文言をここで固定する。
 *
 * **期待する文言はテストに直書きする。** 正本の定数を取り込んで比べると、正本を書き換えたときに
 * テストも一緒に変わり、何も守らない。
 *
 * 既存のテストが固定済みの組は重ねて書かない:
 * - timer の INVALID_JSON・INVALID_COMMAND（形の違うコマンド）: `live-ws.errors.test.ts`
 * - timer の INVALID_COMMAND（表示名が規約に合わない）: `live-ws.display-name.test.ts`
 * - ハブの INVALID_COMMAND: `live-ws.hub.test.ts`
 * - poker の room-not-found: `poker/check-room.test.ts`・`poker/commit-room-action.test.ts`
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import type { WsAdapter } from "../src/adapters/ws-adapter.js";
import { newTestWsAdapter } from "./support/test-ws-adapter.js";
import { collectingLogger } from "./support/test-logger.js";
import { startLiveSyncServer, type LiveSyncServer } from "./support/live-sync-server.js";
import { startServer, type TestServer } from "./poker/helpers.js";
import { connectRaw } from "./poker/raw-ws-client.js";

/** `config.ts` の既定の上限（64KB）を 1 バイト超える本文。 */
const TOO_LARGE = "x".repeat(64 * 1024 + 1);

/** 生テキストを送り、最初に届いたフレームを返す。 */
async function sendAndTakeFirst(url: string, raw: string): Promise<Record<string, unknown>> {
  const ws = new WebSocket(url);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const first = new Promise<Record<string, unknown>>((resolve) => {
      ws.once("message", (buf: Buffer) => resolve(JSON.parse(buf.toString())));
    });
    ws.send(raw);
    return await first;
  } finally {
    ws.close();
  }
}

describe("接続層のエラーの文言（実 WS 越し・同期サーバー全体）", () => {
  let server: LiveSyncServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  /** `tool` が null ならハブ（`?tool=` を付けない接続）。 */
  function urlOf(tool: string | null): string {
    const query = tool === null ? "" : `?tool=${tool}`;
    return `ws://127.0.0.1:${server!.port}/ws${query}`;
  }

  // ハブ・お題・ルーレットは、壊れた JSON と形の違うコマンドの文言を、それぞれの経路で返す
  // （ハブは hub-handlers の直書き、お題・ルーレットは core の文言の表）。
  for (const [label, tool] of [
    ["ハブ", null],
    ["お題", "topic"],
    ["ルーレット", "roulette"],
  ] as const) {
    it(`Given ${label}の接続 / When 壊れた JSON を送る / Then INVALID_JSON と「JSON の形式が不正です」を返す`, async () => {
      // Given
      server = startLiveSyncServer();
      // When
      const frame = await sendAndTakeFirst(urlOf(tool), "{ 壊れている");
      // Then
      expect(frame).toEqual({ type: "error", code: "INVALID_JSON", message: "JSON の形式が不正です" });
    });

    it(`Given ${label}の接続 / When 形の違うコマンドを送る / Then INVALID_COMMAND と「コマンドの形式が不正です」を返す`, async () => {
      // Given
      server = startLiveSyncServer();
      // When
      const frame = await sendAndTakeFirst(urlOf(tool), JSON.stringify({ command: "no.such.command" }));
      // Then
      expect(frame).toEqual({ type: "error", code: "INVALID_COMMAND", message: "コマンドの形式が不正です" });
    });
  }

  for (const [label, tool] of [
    ["timer", "timer"],
    ["ハブ", null],
    ["お題", "topic"],
    ["ルーレット", "roulette"],
  ] as const) {
    it(`Given ${label}の接続 / When 上限を超える本文を送る / Then MESSAGE_TOO_LARGE と「メッセージが大きすぎます」を返す`, async () => {
      // Given
      server = startLiveSyncServer();
      // When
      const frame = await sendAndTakeFirst(urlOf(tool), TOO_LARGE);
      // Then
      expect(frame).toEqual({ type: "error", code: "MESSAGE_TOO_LARGE", message: "メッセージが大きすぎます" });
    });
  }

  it("Given poker の接続 / When 上限を超える本文を送る / Then message-too-large と「メッセージが大きすぎます」を返す", async () => {
    // Given
    server = startLiveSyncServer();
    // When
    const frame = await sendAndTakeFirst(urlOf("poker"), TOO_LARGE);
    // Then
    expect(frame).toEqual({ type: "error", code: "message-too-large", message: "メッセージが大きすぎます" });
  });
});

describe("接続層のエラーの文言（接続層・メッセージ層が失敗したとき）", () => {
  let adapter: WsAdapter | undefined;
  afterEach(async () => {
    await adapter?.close();
    adapter = undefined;
  });

  const rejects = async (): Promise<void> => {
    throw new Error("メッセージ層の失敗（テスト用）");
  };

  // 文言もログも 4 つの接続で同じ（#381）。かつて timer だけ文言が「内部エラーが発生しました」で、
  // reject でログも残さなかった（#362・#368 の特性テストで見つかり、#381 でそろえた）。
  const INTERNAL_ERROR_MESSAGE = "サーバー内部でエラーが発生しました";
  for (const [label, tool, protocol] of [
    ["timer", "timer", "timer"],
    ["ハブ", null, "hub"],
    ["お題", "topic", "topic"],
    ["ルーレット", "roulette", "roulette"],
  ] as const) {
    // どの接続の失敗かは `protocol` に出る（固定の語彙。#381）
    const LOG_LINES = [`on-message-error name=Error protocol=${protocol}`];
    it(`Given ${label}のメッセージ層が reject する / When 妥当な本文を送る / Then INTERNAL_ERROR と「${INTERNAL_ERROR_MESSAGE}」を返し、ログは ${LOG_LINES.length} 行`, async () => {
      // Given: どのメッセージ層も reject する接続層
      const { logger, lines } = collectingLogger();
      adapter = newTestWsAdapter({
        port: 0,
        host: "127.0.0.1",
        allowedOrigins: [],
        timer: { handleMessage: rejects },
        hub: { handleMessage: rejects },
        topic: { handleMessage: rejects },
        roulette: { handleMessage: rejects },
        onDisconnect: () => {},
        logger,
      });
      const query = tool === null ? "" : `?tool=${tool}`;
      // timer は接続層でスキーマを検めるので、妥当なコマンドを送る（それ以外は生テキストのまま渡る）
      const body = JSON.stringify({ command: "time.ping", clientTime: 1 });
      // When
      const frame = await sendAndTakeFirst(`ws://127.0.0.1:${adapter.port}/ws${query}`, body);
      // Then: ログはエラーフレームを送る前に書かれるので、フレームが届いた時点で揃っている
      expect(frame).toEqual({ type: "error", code: "INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE });
      expect(lines).toEqual(LOG_LINES);
    });
  }
});

describe("poker の参加の試行の上限の文言", () => {
  let poker: TestServer | undefined;
  afterEach(async () => {
    await poker?.stop();
    poker = undefined;
  });

  it("Given 参加の試行を上限まで使った接続 / When もう一度 join-room を送る / Then rate-limited と「試行が多すぎます。しばらくしてからお試しください」を返す", async () => {
    // Given: 本番と同じ設定（レート制限が効く）
    poker = await startServer({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://example.com", HOST: "127.0.0.1" });
    const client = await connectRaw(poker.port, { origin: "https://example.com", forwardedFor: "203.0.113.9" });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      client.send({ type: "join-room", roomId: `nope${i}`, name: "侵入者" });
      await client.nextText();
    }
    // When
    client.send({ type: "join-room", roomId: "nope-final", name: "侵入者" });
    const frame = await client.nextText();
    // Then
    expect(frame).toEqual({
      type: "error",
      code: "rate-limited",
      message: "試行が多すぎます。しばらくしてからお試しください",
    });
    client.close();
  });
});
