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
    adapter = new WsAdapter({
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
    adapter = new WsAdapter({
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
    adapter = new WsAdapter({
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
    adapter = new WsAdapter({
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
});
