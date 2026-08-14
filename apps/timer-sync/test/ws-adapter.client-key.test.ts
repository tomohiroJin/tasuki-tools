/**
 * WsAdapter がクライアント鍵を導出して onConnect へ渡すことのテスト。
 *
 * `ws`（npm）の WebSocket はコンストラクタでリクエストヘッダを足せるので、
 * X-Forwarded-For を持つ接続を実際に張って確かめられる。
 *
 * 境界値は族で網羅する: XFF が無い / 空 / 不正な値 / 正常な IPv4 / 正常な IPv6 /
 * Origin 検査で弾かれた接続 / 接続数上限で弾かれた接続。
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { createClientKeyDeriver } from "@tasuki/rate-limit";
import { testLogger } from "./support/test-logger.js";

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

/** close イベント（code）を待つ。 */
function waitClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.on("close", (code) => resolve(code)));
}

/** onConnect が受け取った (connId, rateKey) を集める */
function startAdapter(
  options: Partial<ConstructorParameters<typeof WsAdapter>[0]> = {},
): { url: string; seen: Array<[string, string]> } {
  const seen: Array<[string, string]> = [];
  adapter = new WsAdapter({
    port: 0,
    host: "127.0.0.1",
    allowedOrigins: [],
    onMessage: async () => {},
    onDisconnect: () => {},
    onConnect: (connId, rateKey) => seen.push([connId, rateKey]),
    deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(9)),
    logger: testLogger,
    ...options,
  });
  return { url: `ws://127.0.0.1:${adapter.port}`, seen };
}

describe("WsAdapter のクライアント鍵", () => {
  it("X-Forwarded-For（正常な IPv4）があれば、そこから導いた鍵を onConnect へ渡す", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.7" } });
    await waitOpen(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).not.toBe(connId);
    expect(rateKey).not.toContain("203.0.113.7");
    ws.close();
  });

  it("同じ /64 の別 IPv6 アドレスからは同じ鍵になる", async () => {
    const { url, seen } = startAdapter();
    const a = new WebSocket(url, { headers: { "x-forwarded-for": "2001:db8::1" } });
    await waitOpen(a);
    const b = new WebSocket(url, { headers: { "x-forwarded-for": "2001:DB8::dead:beef" } });
    await waitOpen(b);
    await Bun.sleep(50);

    expect(seen).toHaveLength(2);
    expect(seen[0]![1]).toBe(seen[1]![1]);
    a.close();
    b.close();
  });

  it("X-Forwarded-For が無ければ connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url);
    await waitOpen(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("X-Forwarded-For が空文字なら connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "" } });
    await waitOpen(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("X-Forwarded-For が IP と解釈できない値なら connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "not-an-ip-address" } });
    await waitOpen(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });

  it("Origin 検査で弾かれた接続では onConnect を呼ばない", async () => {
    const { url, seen } = startAdapter({ allowedOrigins: ["https://allowed.example"] });
    const ws = new WebSocket(url, {
      origin: "https://evil.example",
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    await waitClose(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(0);
  });

  it("接続数上限で弾かれた接続では onConnect を呼ばない", async () => {
    const { url, seen } = startAdapter({ maxConnections: 1 });
    const first = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.1" } });
    await waitOpen(first);
    // 上限に達した状態で 2 本目を張る
    const second = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.2" } });
    await waitClose(second);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    expect(seen[0]![1]).not.toBe("conn-2");
    first.close();
  });
});
