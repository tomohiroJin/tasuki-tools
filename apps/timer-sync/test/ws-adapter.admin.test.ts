import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { testLogger } from "./support/test-logger.js";

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

// ポートは OS に選ばせる（`port: 0`）。実ポートは `adapter.port` から取る。
const base = {
  port: 0,
  host: "127.0.0.1",
  allowedOrigins: [] as string[],
  onMessage: async () => {},
  onDisconnect: () => {},
  logger: testLogger,
};

function httpUrl(path: string): string {
  return `http://127.0.0.1:${adapter!.port}${path}`;
}

describe("WsAdapter の httpHandler フック", () => {
  it("httpHandler が結果を返すパスはその応答を返す", async () => {
    // Given
    adapter = new WsAdapter({
      ...base,
      httpHandler: (req) =>
        req.path === "/status"
          ? {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true }),
            }
          : null,
    });

    // When
    const res = await fetch(httpUrl("/status"));

    // Then
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("httpHandler が null のパスは 426（既存挙動の維持）", async () => {
    // Given
    adapter = new WsAdapter({ ...base, httpHandler: () => null });

    // When / Then
    expect((await fetch(httpUrl("/"))).status).toBe(426);
  });

  it("httpHandler 未指定でも 426（後方互換）", async () => {
    // Given
    adapter = new WsAdapter({ ...base });

    // When / Then
    expect((await fetch(httpUrl("/"))).status).toBe(426);
  });
});

describe("WsAdapter.close の graceful shutdown", () => {
  // ⚠ かつてここは「close() が 2 秒以内に解決するか」を Promise.race で見ていた。
  // close() は Bun 移行で**必ず即座に解決する**ようになったため、その形では
  // `server.stop(true)` の行を丸ごと消しても緑のまま通る（＝恒真の空検証）。
  // 739f2da（PR #43 のレビュー対応）で確立した「間接的な観測ではなく機構そのものを
  // 直接検証する」方針に合わせ、close() が実際に何をするかを 2 点で確かめる。
  it("close() は活線接続を切り、同じポートで即座に listen し直せる状態にする", async () => {
    // Given（WS クライアントを 1 本繋いだ状態を作る）
    adapter = new WsAdapter({ ...base });
    // 「同じポートで listen し直せる」を見るテストなので、OS が選んだ実ポートを控えておく。
    const port = adapter.port;
    const client = new WebSocket(`ws://127.0.0.1:${port}/`);
    await new Promise<void>((resolve, reject) => {
      client.on("open", () => resolve());
      client.on("error", reject);
    });
    const clientSawClose = new Promise<boolean>((resolve) => {
      client.on("close", () => resolve(true));
      setTimeout(() => resolve(false), 2_000);
    });

    // When
    await adapter.close();
    adapter = undefined; // afterEach の二重 close を避ける

    // Then 1: 活線だったクライアントが切断を観測する（接続が実際に切れている）
    expect(await clientSawClose).toBe(true);

    // Then 2: ポートが解放されている。
    // ここで WsAdapter を使わないのは、bind に失敗すると**コンストラクタが
    // process.exit(1) する**ため、テストが「失敗」ではなくプロセス終了になるから。
    // 素の Bun.serve なら例外が上がり、テストの失敗として観測できる。
    const probe = Bun.serve({
      port,
      hostname: base.host,
      fetch: () => new Response("probe"),
    });
    expect(probe.port).toBe(port);
    probe.stop(true);
  });
});
