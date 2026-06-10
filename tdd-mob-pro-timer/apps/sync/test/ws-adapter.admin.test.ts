import { describe, it, expect, afterEach } from "vitest";
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
    const res = await fetch(`http://127.0.0.1:${PORT}/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("httpHandler が null のパスは 426（既存挙動の維持）", async () => {
    adapter = new WsAdapter({ ...base, port: PORT, httpHandler: () => null });
    await new Promise((r) => setTimeout(r, 150));
    expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(426);
  });

  it("httpHandler 未指定でも 426（後方互換）", async () => {
    adapter = new WsAdapter({ ...base, port: PORT });
    await new Promise((r) => setTimeout(r, 150));
    expect((await fetch(`http://127.0.0.1:${PORT}/`)).status).toBe(426);
  });
});
