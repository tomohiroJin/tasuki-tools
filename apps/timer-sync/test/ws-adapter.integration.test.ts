import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

const PORT = 18790; // テスト専用ポート

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

/** close イベント（code）を待つ。 */
function waitClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.on("close", (code) => resolve(code)));
}
function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

describe("WsAdapter 接続数上限", () => {
  it("maxConnections を超える接続は 1013 で閉じる", async () => {
    // Given
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      maxConnections: 1,
      onMessage: async () => {},
      onDisconnect: () => {},
    });
    const ws1 = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await waitOpen(ws1);

    // When
    const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const code = await waitClose(ws2);

    // Then
    expect(code).toBe(1013);
    ws1.close();
  });

  it("Origin 不許可は 1008 で閉じる", async () => {
    // Given
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: ["https://allowed.example"],
      maxConnections: 100,
      onMessage: async () => {},
      onDisconnect: () => {},
    });

    // When
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, {
      origin: "https://evil.example",
    });
    const code = await waitClose(ws);

    // Then
    expect(code).toBe(1008);
  });

  it("allowedOrigins 空なら任意 Origin の接続を許可する（dev）", async () => {
    // Given
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      maxConnections: 100,
      onMessage: async () => {},
      onDisconnect: () => {},
    });

    // When
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: "https://anything.example" });

    // Then
    await expect(waitOpen(ws)).resolves.toBeUndefined();
    ws.close();
  });
});
