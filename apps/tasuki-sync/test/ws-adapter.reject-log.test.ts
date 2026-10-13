/**
 * 接続拒否時のログのテスト（#103 敵対的レビュー P-2）。
 *
 * 本番構成で XFF なし接続・不許可 Origin 接続を張っても journal が完全に無言
 * だった（再レビューが実測）。Caddy 側の `header_up X-Forwarded-For` が消える・
 * 経路が変わるなどで拒否が増えても気づけないのは実害なので、拒否の 2 経路
 * （クライアント鍵なし／Origin 不許可）それぞれに列挙値だけの 1 行を出す。
 *
 * **生の IP・Origin の値・相関キーはログへ出さない**（ADR 0012 D3）。
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { newTestWsAdapter } from "./support/test-ws-adapter.js";
import { createClientKeyDeriver } from "@tasuki/rate-limit";
import { collectingLogger } from "./support/test-logger.js";

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

/** close イベント（code, reason）を待つ。 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

/** 固定の相関ソルト。生の IP がログに出ていないことを検査するのに使う。 */
const RAW_IP = "203.0.113.99";
const DISALLOWED_ORIGIN = "https://evil.example.com";

describe("拒否時のログ（P-2）", () => {
  it("クライアント鍵が無い接続を拒否したとき、reason=client-address の警告ログを 1 行出す", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(3)),
      requireClientAddress: true,
      logger,
    });
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);

    const closed = await waitClose(ws);

    // Then
    expect(closed.code).toBe(1008);
    const rejectLines = lines.filter((l) => l.startsWith("conn-rejected"));
    expect(rejectLines).toHaveLength(1);
    expect(rejectLines[0]).toBe("conn-rejected reason=client-address");
  });

  it("許可されていない Origin の接続を拒否したとき、reason=origin の警告ログを 1 行出す", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: ["https://example.com"],
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(3)),
      requireClientAddress: false,
      logger,
    });
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
      headers: { "x-forwarded-for": RAW_IP, origin: DISALLOWED_ORIGIN },
    });

    const closed = await waitClose(ws);

    // Then
    expect(closed.code).toBe(1008);
    const rejectLines = lines.filter((l) => l.startsWith("conn-rejected"));
    expect(rejectLines).toHaveLength(1);
    expect(rejectLines[0]).toBe("conn-rejected reason=origin");
  });

  it("受理された接続では conn-rejected を出さない", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(3)),
      requireClientAddress: false,
      logger,
    });
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
    await waitOpen(ws);

    // Then
    expect(lines.filter((l) => l.startsWith("conn-rejected"))).toHaveLength(0);
    ws.close();
  });

  it("拒否ログに生の IP・Origin の値・相関キーが含まれない", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: ["https://example.com"],
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(3)),
      requireClientAddress: false,
      logger,
    });
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
      headers: { "x-forwarded-for": RAW_IP, origin: DISALLOWED_ORIGIN },
    });
    await waitClose(ws);

    for (const line of lines) {
    // Then
      expect(line).not.toContain(RAW_IP);
      expect(line).not.toContain(DISALLOWED_ORIGIN);
      expect(line).not.toContain("evil.example.com");
    }
  });

  it("Given 許可表に無い ?tool= / When 繋ぐ / Then 1008（Unknown tool）で閉じ、reason=tool の警告ログを 1 行出す", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      onMessage: async () => {},
      onDisconnect: () => {},
      logger,
    });
    // When
    const closed = await waitClose(new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=no-such-tool`));
    // Then
    expect(closed).toEqual({ code: 1008, reason: "Unknown tool" });
    expect(lines.filter((l) => l.startsWith("conn-rejected"))).toEqual(["conn-rejected reason=tool"]);
  });

  it("Given 同時接続数の上限に達している / When もう 1 本繋ぐ / Then 1013 で閉じ、拒否のログは出さない", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: [],
      maxConnections: 1,
      onMessage: async () => {},
      onDisconnect: () => {},
      logger,
    });
    const first = new WebSocket(`ws://127.0.0.1:${adapter.port}`);
    await waitOpen(first);
    // When
    const closed = await waitClose(new WebSocket(`ws://127.0.0.1:${adapter.port}`));
    // Then
    expect(closed).toEqual({ code: 1013, reason: "Server connection limit reached" });
    expect(lines).toEqual([]);
    first.close();
  });
});

/**
 * 入場の判定の順番（#368 Task 1）。
 *
 * 拒否はどれも 1008 なので、順番が入れ替わると「直結が拒否される」ことを確かめるテストが、
 * 別の拒否を見ているだけの空振りになる（`ws-adapter.ts` の `handleOpen` のコメント）。
 * 順番は **知らないツール → クライアント鍵 → Origin → 接続数** で、close の理由とログの理由で見分ける。
 */
describe("入場の判定の順番", () => {
  const strictAdapter = (logger: ReturnType<typeof collectingLogger>["logger"]) =>
    newTestWsAdapter({
      port: 0,
      host: "127.0.0.1",
      allowedOrigins: ["https://example.com"],
      maxConnections: 0,
      onMessage: async () => {},
      onDisconnect: () => {},
      deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(3)),
      requireClientAddress: true,
      logger,
    });

  it("Given 知らないツール・鍵なし・Origin 不許可・上限超過 / When 繋ぐ / Then 知らないツールで拒む", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = strictAdapter(logger);
    // When
    const closed = await waitClose(
      new WebSocket(`ws://127.0.0.1:${adapter.port}/ws?tool=no-such-tool`, { headers: { origin: DISALLOWED_ORIGIN } }),
    );
    // Then
    expect(closed).toEqual({ code: 1008, reason: "Unknown tool" });
    expect(lines).toEqual(["conn-rejected reason=tool"]);
  });

  it("Given 鍵なし・Origin 不許可・上限超過 / When 繋ぐ / Then クライアント鍵で拒む", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = strictAdapter(logger);
    // When
    const closed = await waitClose(
      new WebSocket(`ws://127.0.0.1:${adapter.port}`, { headers: { origin: DISALLOWED_ORIGIN } }),
    );
    // Then
    expect(closed).toEqual({ code: 1008, reason: "Client address required" });
    expect(lines).toEqual(["conn-rejected reason=client-address"]);
  });

  it("Given 鍵あり・Origin 不許可・上限超過 / When 繋ぐ / Then Origin で拒む", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = strictAdapter(logger);
    // When
    const closed = await waitClose(
      new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
        headers: { origin: DISALLOWED_ORIGIN, "x-forwarded-for": RAW_IP },
      }),
    );
    // Then
    expect(closed).toEqual({ code: 1008, reason: "Origin not allowed" });
    expect(lines).toEqual(["conn-rejected reason=origin"]);
  });

  it("Given 鍵あり・Origin 許可・上限超過 / When 繋ぐ / Then 接続数で拒む", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = strictAdapter(logger);
    // When
    const closed = await waitClose(
      new WebSocket(`ws://127.0.0.1:${adapter.port}`, {
        headers: { origin: "https://example.com", "x-forwarded-for": RAW_IP },
      }),
    );
    // Then
    expect(closed).toEqual({ code: 1013, reason: "Server connection limit reached" });
    expect(lines).toEqual([]);
  });
});
