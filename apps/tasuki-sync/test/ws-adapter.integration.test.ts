import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { ServerStartError, WsAdapter } from "../src/adapters/ws-adapter.js";
import { newTestWsAdapter } from "./support/test-ws-adapter.js";
import { collectingLogger, testLogger } from "./support/test-logger.js";

// ポートは OS に選ばせる（`port: 0`）。実ポートは `adapter.port` から取る。
// かつては固定値を手で割り当て、ファイル間で重複しないようコメントで帳簿を
// 作っていたが、その帳簿は人が保守するかぎり必ず腐る（#80）。
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

/** アダプタを `port: 0` で起動し、接続先 URL とともに返す。 */
function startAdapter(options: Partial<ConstructorParameters<typeof WsAdapter>[0]> = {}): string {
  adapter = newTestWsAdapter({
    port: 0,
    host: "127.0.0.1",
    allowedOrigins: [],
    timer: { handleMessage: async () => {} },
    onDisconnect: () => {},
    logger: testLogger,
    ...options,
  });
  return `ws://127.0.0.1:${adapter.port}`;
}

describe("WsAdapter 接続数上限", () => {
  it("maxConnections を超える接続は 1013 で閉じる", async () => {
    // Given
    const url = startAdapter({ maxConnections: 1 });
    const ws1 = new WebSocket(url);
    await waitOpen(ws1);

    // When
    const ws2 = new WebSocket(url);
    const code = await waitClose(ws2);

    // Then
    expect(code).toBe(1013);
    ws1.close();
  });

  it("Origin 不許可は 1008 で閉じる", async () => {
    // Given
    const url = startAdapter({
      allowedOrigins: ["https://allowed.example"],
      maxConnections: 100,
    });

    // When
    const ws = new WebSocket(url, { origin: "https://evil.example" });
    const code = await waitClose(ws);

    // Then
    expect(code).toBe(1008);
  });

  it("allowedOrigins 空なら任意 Origin の接続を許可する（dev）", async () => {
    // Given
    const url = startAdapter({ allowedOrigins: [], maxConnections: 100 });

    // When
    const ws = new WebSocket(url, { origin: "https://anything.example" });

    // Then
    await expect(waitOpen(ws)).resolves.toBeUndefined();
    ws.close();
  });
});

describe("WsAdapter.port", () => {
  it("port: 0 で起動すると OS が選んだ実ポートを返し、そこへ接続できる", async () => {
    // Given（既定のオプションで起動する）
    // When
    const url = startAdapter();

    // Then: 0 のままではなく実際に listen しているポートが返る
    expect(adapter!.port).toBeGreaterThan(0);
    const ws = new WebSocket(url);
    await expect(waitOpen(ws)).resolves.toBeUndefined();
    ws.close();
  });
});

/**
 * 起動の失敗（#368 Task 8）。
 *
 * bind に失敗したら（この機械が持たないアドレスで待ち受ける。EADDRNOTAVAIL）、アダプタは `http-server-error` を 1 行残して
 * {@link ServerStartError} を投げる。**プロセスを終わらせるのは組み立て（`server.ts`）の仕事**で、
 * アダプタは `process.exit` を呼ばない（呼ぶとテストのプロセスごと終わり、この失敗をテストできなかった）。
 *
 * 同じポートで 2 つ目を起こす形は使わない。テストの中では Bun が 2 つ目の bind を通すことがあった（2026-10-13 に実測）。
 * 文書用のアドレス（RFC 5737 の TEST-NET-3）は、どの機械も持たないので必ず失敗する。
 */
describe("WsAdapter の起動の失敗", () => {
  it("Given この機械が持たないアドレス / When 起こす / Then http-server-error を 1 行残して ServerStartError を投げ、process.exit は呼ばない", () => {
    // Given
    const { logger, lines } = collectingLogger();
    const exitCalls: unknown[] = [];
    const realExit = process.exit;
    process.exit = ((code?: number) => {
      exitCalls.push(code);
    }) as typeof process.exit;
    try {
      // When
      const start = () =>
        newTestWsAdapter({
          port: 0,
          host: "203.0.113.1",
          allowedOrigins: [],
          timer: { handleMessage: async () => {} },
          onDisconnect: () => {},
          logger,
        });
      // Then
      expect(start).toThrow(ServerStartError);
      expect(exitCalls).toEqual([]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toStartWith("http-server-error name=");
    } finally {
      process.exit = realExit;
    }
  });
});
