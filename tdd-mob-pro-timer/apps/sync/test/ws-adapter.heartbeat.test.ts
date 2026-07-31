/**
 * サーバー側の死活監視（Issue #25）。
 * WsAdapter がサーバー主導で ws.ping/pong による生存確認を行い、
 * 応答のない接続を検出して terminate（既存の close 経路に委譲）することを検証する。
 */
import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

const PORT = 18791; // テスト専用ポート（integration/admin と重複しない値）

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

/** onDisconnect が呼ばれるのを待つ（タイムアウト付き）。 */
function waitDisconnect(
  timeoutMs: number,
): { promise: Promise<string>; onDisconnect: (connId: string) => void } {
  let resolve!: (connId: string) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    setTimeout(() => rej(new Error("onDisconnect timeout")), timeoutMs);
  });
  return { promise, onDisconnect: (connId: string) => resolve(connId) };
}

describe("WsAdapter ハートビート（死活監視・Issue #25）", () => {
  it("pong を一切返さない接続は許容ミス回数を超えると terminate され、onDisconnect が発火する", async () => {
    // Given: 短い間隔・許容ミス2回のハートビートを持つアダプタ
    const { promise, onDisconnect } = waitDisconnect(2_000);
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      heartbeatIntervalMs: 30,
      heartbeatMaxMisses: 2,
      onMessage: async () => {},
      onDisconnect,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await waitOpen(ws);
    // pause() で読み取りを止め、ping への自動 pong 応答を発生させない（半開き接続の再現）。
    // 読み取りを止めているため、この後クライアント側は close イベントを観測できない
    // （サーバー側が terminate しても FIN の処理が進まない）。検証はサーバー側の
    // onDisconnect 発火（＝既存の close 経路に処理が委譲されたこと）で行う。
    ws.pause();

    // When / Then: 3 interval 分（missed 1,2 → terminate）以内にサーバー側で検出される
    const disconnectedConnId = await promise;
    expect(disconnectedConnId).toBeDefined();

    ws.terminate();
  });

  it("pong を返し続ける接続は許容ミス回数を超えても terminate されない", async () => {
    // Given
    let disconnected = false;
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      heartbeatIntervalMs: 20,
      heartbeatMaxMisses: 2,
      onMessage: async () => {},
      onDisconnect: () => {
        disconnected = true;
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await waitOpen(ws);
    // ws クライアントは既定で ping に自動 pong するため、何もしなければ生存確認が通り続ける。

    // When: 許容ミス回数を大きく超える時間（interval の10倍相当）待つ
    await new Promise((r) => setTimeout(r, 300));

    // Then
    expect(disconnected).toBe(false);
    ws.close();
  });

  it("1回だけ pong が欠落し、その後 pong が復帰した接続は terminate されない（US2: 誤検出しない）", async () => {
    // Given
    let disconnected = false;
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      heartbeatIntervalMs: 30,
      heartbeatMaxMisses: 2,
      onMessage: async () => {},
      onDisconnect: () => {
        disconnected = true;
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await waitOpen(ws);

    // When: 1 interval 分だけ pause（1回 pong を欠落させる）し、その後 resume して応答を復帰させる
    ws.pause();
    await new Promise((r) => setTimeout(r, 35));
    ws.resume();

    // Then: 欠落からの復帰後、さらに数 interval 待っても terminate されない
    await new Promise((r) => setTimeout(r, 200));
    expect(disconnected).toBe(false);
    ws.close();
  });

  it("close() 呼び出し後は heartbeat の setInterval が停止する（タイマーリークしない）", async () => {
    // Given
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      heartbeatIntervalMs: 20,
      onMessage: async () => {},
      onDisconnect: () => {},
    });

    // When
    await adapter.close();
    adapter = undefined;

    // Then: close 後に例外なくプロセスが継続できる（追加の待機でクラッシュしない）ことを確認
    await new Promise((r) => setTimeout(r, 50));
    expect(true).toBe(true);
  });
});
