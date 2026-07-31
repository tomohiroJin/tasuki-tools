/**
 * サーバー側の死活監視（Issue #25）。
 * WsAdapter がサーバー主導で ws.ping/pong による生存確認を行い、
 * 応答のない接続を検出して terminate（既存の close 経路に委譲）することを検証する。
 *
 * ハートビートの setInterval/clearInterval だけをフェイクタイマー化し（vi.useFakeTimers の
 * toFake で限定）、pong の授受は実ソケット越しの実 I/O のまま扱う。こうすることで
 * 「ping/pong の間隔」は決定的に進められる一方、実際の TCP ラウンドトリップに依存する
 * pong の到達は本物の非同期処理として検証できる。固定 sleep（testing.md が避けるべきとする
 * パターン）を「fake timer の advance」＋「実 I/O を捌くための最小限の setImmediate 待ち」に
 * 置き換えている。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

const PORT = 18791; // テスト専用ポート（integration/admin と重複しない値）

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
  vi.useRealTimers();
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

/** フェイクタイマーを1 interval 分進め、実ソケットの pong 往復（実 I/O）を捌く猶予を挟む。 */
async function advanceOneHeartbeatTick(intervalMs: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(intervalMs);
  // setImmediate はフェイク化していないため、ここで実イベントループに1周分譲り、
  // 直前の ws.ping() に対する実ソケットの pong 到達を処理させる。
  await new Promise((r) => setImmediate(r));
}

describe("WsAdapter ハートビート（死活監視・Issue #25）", () => {
  it("pong を一切返さない接続は許容ミス回数を超えると terminate され、onDisconnect が発火する", async () => {
    // Given: 短い間隔・許容ミス2回のハートビートを持つアダプタ
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
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

    // When: 3 interval 分（missed 1,2 → terminate）を決定的に進める
    await advanceOneHeartbeatTick(30);
    await advanceOneHeartbeatTick(30);
    await advanceOneHeartbeatTick(30);

    // Then: サーバー側で検出され onDisconnect が発火する
    const disconnectedConnId = await promise;
    expect(disconnectedConnId).toBeDefined();

    ws.terminate();
  });

  it("pong を返し続ける接続は許容ミス回数を超えても terminate されない", async () => {
    // Given
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
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

    // When: 許容ミス回数（2回）を大きく超える10 interval 分を決定的に進める
    for (let i = 0; i < 10; i++) {
      await advanceOneHeartbeatTick(20);
    }

    // Then
    expect(disconnected).toBe(false);
    ws.close();
  });

  it("1回だけ pong が欠落し、その後 pong が復帰した接続は terminate されない（US2: 誤検出しない）", async () => {
    // Given
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
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
    await advanceOneHeartbeatTick(30);
    ws.resume();
    // resume 直後にキューイングされていた ping への pong 応答を実 I/O で処理させる猶予。
    await new Promise((r) => setImmediate(r));

    // Then: 欠落からの復帰後、さらに数 interval 分進めても terminate されない
    for (let i = 0; i < 6; i++) {
      await advanceOneHeartbeatTick(30);
    }
    expect(disconnected).toBe(false);
    ws.close();
  });

  it("close() は heartbeat の setInterval を停止する（clearInterval を呼ぶ）", async () => {
    // Given: setInterval/clearInterval は素の実装（フェイク化しない）のまま、
    // close() が実際に clearInterval を呼ぶことを spy で直接検証する。
    // 「close 後に ping が増えない」という間接的な観測は、close() が接続を
    // terminate 済みで connections が空になるため、clearInterval を呼ばなくても
    // 偽陽性で緑になってしまう（タイマー自体は動き続けても検知できない）。
    // そのため stopHeartbeat の呼び出しそのものを直接検証する。
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      heartbeatIntervalMs: 10_000,
      onMessage: async () => {},
      onDisconnect: () => {},
    });

    // When
    await adapter.close();
    adapter = undefined;

    // Then
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
