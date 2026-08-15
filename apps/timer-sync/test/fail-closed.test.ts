/**
 * 本番の二段 fail-closed のテスト（#103・設計正本 D6）。
 *
 * ## なぜクライアント鍵の検査を Origin より前に置くか
 *
 * どちらも close コードは 1008 で、reason でしか区別できない。Origin を先に見ると、
 * 「Caddy を迂回した直結が拒否される」ことを確かめたいテストが、実は Origin 拒否を
 * 見ているだけ、という空振りになる。前に置けば、Origin ヘッダを持たない素の接続でも
 * 「クライアント鍵が無いこと」を理由に拒否されたと確定できる。
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { loadSyncConfig } from "../src/config.js";
import { createSyncServer, type SyncServer } from "../src/create-sync-server.js";

let server: SyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/**
 * close の (code, reason) を待つ。
 *
 * **`open` では判定できない。** ハンドシェイク（101 応答）はいったん通してから
 * アプリ層が close するので（このファイル冒頭の docstring）、拒否される接続でも
 * `ws` ライブラリの `open` イベントは一度発火する。拒否されたかどうかは、その後に
 * 届く close フレームの code/reason でしか区別できない。
 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

describe("起動時の fail-closed（HOST）", () => {
  it("本番でループバック以外を指定すると起動を拒否する", () => {
    // Given（env をその場で組み立てる）
    // When / Then（読み込み自体が throw する）
    expect(() =>
      loadSyncConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://example.com",
        HOST: "0.0.0.0",
      }),
    ).toThrow(/HOST/);
  });

  it("本番でも 127.0.0.1 なら通る", () => {
    // Given（env をその場で組み立てる）
    // When（読み込む）
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      HOST: "127.0.0.1",
    });
    // Then
    expect(config.host).toBe("127.0.0.1");
  });

  it("本番でも ::1 なら通る", () => {
    // Given（env をその場で組み立てる）
    // When（読み込む）
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      HOST: "::1",
    });
    expect(config.host).toBe("::1");
  });

  it("本番以外なら 0.0.0.0 でも通る", () => {
    const config = loadSyncConfig({ HOST: "0.0.0.0" });
    expect(config.host).toBe("0.0.0.0");
  });
});

describe("接続時の fail-closed（X-Forwarded-For）", () => {
  it("本番でヘッダが無い接続は Origin 拒否とは違う理由で閉じられる", async () => {
    // Given
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      PORT: "0",
      HOST: "127.0.0.1",
    });
    server = createSyncServer(config);
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`);

    const closed = await waitClose(ws);

    // Then
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe("Client address required");
  });

  it("本番で X-Real-IP だけを付けても、X-Forwarded-For が無ければ拒否される（X-Real-IP は鍵の材料にならない）", async () => {
    // Given
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      PORT: "0",
      HOST: "127.0.0.1",
    });
    server = createSyncServer(config);
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`, {
      headers: { "x-real-ip": "203.0.113.7", origin: "https://example.com" },
    });

    const closed = await waitClose(ws);

    // Then
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe("Client address required");
  });

  it("本番でヘッダがあれば繋がる", async () => {
    // Given
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      PORT: "0",
      HOST: "127.0.0.1",
    });
    server = createSyncServer(config);
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`, {
      headers: { "x-forwarded-for": "203.0.113.7", origin: "https://example.com" },
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    // Then
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("本番以外ならヘッダが無くても繋がる", async () => {
    // Given
    const config = loadSyncConfig({ PORT: "0", HOST: "127.0.0.1" });
    server = createSyncServer(config);
    // When
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    // Then
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("鍵の検査は Origin の検査より前にある（両方に違反しても reason はクライアント鍵側）", async () => {
    // Given（XFF を付けず、かつ許可されていない Origin を名乗る＝両方に違反する接続）
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      PORT: "0",
      HOST: "127.0.0.1",
    });
    server = createSyncServer(config);
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`, {
      headers: { origin: "https://not-allowed.example.com" },
    });

    // When
    const closed = await waitClose(ws);

    // Then（順序が逆なら "Origin not allowed" が返る）
    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe("Client address required");
  });
});
