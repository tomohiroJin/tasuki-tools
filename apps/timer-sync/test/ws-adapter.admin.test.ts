import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { testLogger, collectingLogger } from "./support/test-logger.js";

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

describe("WsAdapter が httpHandler へ渡すヘッダの許可リスト（I-2）", () => {
  it("大文字混じりの X-Admin-Token ヘッダも小文字キーで httpHandler に届く", async () => {
    // Given
    let received: Record<string, string> | undefined;
    adapter = new WsAdapter({
      ...base,
      httpHandler: (req) => {
        received = req.headers;
        return { status: 200, contentType: "text/plain", body: "ok" };
      },
    });

    // When
    await fetch(httpUrl("/status"), { headers: { "X-Admin-Token": "secret-token" } });

    // Then
    expect(received).toEqual({ "x-admin-token": "secret-token" });
  });

  it("許可リストに無いヘッダ（cookie・x-forwarded-for）は httpHandler に届かない", async () => {
    // Given
    let received: Record<string, string> | undefined;
    adapter = new WsAdapter({
      ...base,
      httpHandler: (req) => {
        received = req.headers;
        return { status: 200, contentType: "text/plain", body: "ok" };
      },
    });

    // When
    await fetch(httpUrl("/status"), {
      headers: { cookie: "session=abc", "x-forwarded-for": "203.0.113.5", "x-admin-token": "t" },
    });

    // Then: 許可リストに載っているものだけが届き、それ以外は消えている
    expect(received).toEqual({ "x-admin-token": "t" });
  });
});

describe("WsAdapter の handleFetch 全体の隔離（I-4）", () => {
  it("httpHandler が throw しても、ロガに記録され、応答は安全な内容を返す", async () => {
    // Given
    const { logger, lines } = collectingLogger();
    adapter = new WsAdapter({
      ...base,
      httpHandler: () => {
        throw new Error("boom in httpHandler");
      },
      logger,
    });

    // When
    const res = await fetch(httpUrl("/anything"));
    const text = await res.text();

    // Then: 例外メッセージが応答に漏れない・ロガ（ADR 0012 D1）に記録される
    expect(text).not.toContain("boom in httpHandler");
    expect(lines.some((line) => line.startsWith("http-fetch-error"))).toBe(true);
    // 応答自体は失敗として扱えるステータス（426 ではなく 500）を返す。
    expect(res.status).toBe(500);
  });
});

describe("WsAdapter の development フラグ（I-3）", () => {
  it("NODE_ENV=development でも development: false が維持され、応答本体にソース断片が出ない", async () => {
    // Given: NODE_ENV を明示的に development にする（Bun.serve の development の
    // 既定値は `process.env.NODE_ENV !== 'production'` なので、素朴な実装なら
    // ここでソース開示モードに落ちる）。
    const originalNodeEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    try {
      adapter = new WsAdapter({
        ...base,
        httpHandler: () => {
          throw new Error("boom from httpHandler development-leak-marker");
        },
      });

      // When
      const res = await fetch(httpUrl("/anything"));
      const text = await res.text();

      // Then: 応答本体は小さく、例外メッセージ・ソース断片を含まない
      // （development: true だと 67,499 バイトの base64 化されたソースが返る
      // ことを再レビューが実測している）。
      expect(text.length).toBeLessThan(1000);
      expect(text).not.toContain("development-leak-marker");
      expect(text).not.toContain("handleFetch");
    } finally {
      if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = originalNodeEnv;
    }
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
