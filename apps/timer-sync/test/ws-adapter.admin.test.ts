import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

// 既存統合テストとのポート衝突を避けるため専用ポートを使う
const PORT = 8799;
const base = {
  host: "127.0.0.1",
  allowedOrigins: [] as string[],
  onMessage: async () => {},
  onDisconnect: () => {},
};

describe("WsAdapter の httpHandler フック", () => {
  it("httpHandler が結果を返すパスはその応答を返す", async () => {
    // Given
    adapter = new WsAdapter({
      ...base,
      port: PORT,
      httpHandler: (req) =>
        req.url === "/status"
          ? {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true }),
            }
          : null,
    });
    await new Promise((r) => setTimeout(r, 150));

    // When
    const res = await fetch(`http://127.0.0.1:${PORT}/status`);

    // Then
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("httpHandler が null のパスは 426（既存挙動の維持）", async () => {
    // Given
    adapter = new WsAdapter({ ...base, port: PORT, httpHandler: () => null });
    await new Promise((r) => setTimeout(r, 150));

    // When / Then
    expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(426);
  });

  it("httpHandler 未指定でも 426（後方互換）", async () => {
    // Given
    adapter = new WsAdapter({ ...base, port: PORT });
    await new Promise((r) => setTimeout(r, 150));

    // When / Then
    expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(426);
  });
});

describe("WsAdapter.close の graceful shutdown", () => {
  it("活線 WS 接続があっても close() が一定時間内に解決する", async () => {
    // Given（WS クライアントを 1 本繋いだ状態を作る）
    adapter = new WsAdapter({ ...base, port: PORT });
    await new Promise((r) => setTimeout(r, 150));
    const client = new WebSocket(`ws://127.0.0.1:${PORT}/`);
    await new Promise<void>((resolve, reject) => {
      client.on("open", () => resolve());
      client.on("error", reject);
    });

    // When（close() が活線接続を terminate して期限内に解決するか）
    const closed = await Promise.race([
      adapter.close().then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
    ]);

    // Then
    expect(closed).toBe(true);
    adapter = undefined; // afterEach の二重 close を避ける
  });
});
