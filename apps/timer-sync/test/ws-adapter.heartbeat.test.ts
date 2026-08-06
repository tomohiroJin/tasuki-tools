/**
 * サーバー側の死活監視（Issue #25）。
 * WsAdapter がサーバー主導で ws.ping/pong による生存確認を行い、
 * 応答のない接続を検出して terminate（既存の close 経路に委譲）することを検証する。
 *
 * ## 待ち方: 条件ベース（testing.md が求める waitFor 型）
 *
 * ハートビートは実タイマーのまま動かし、「N interval 経過した」ではなく
 * **サーバーが実際に ping を N 回送った**ことを待って先へ進む。固定 sleep は使わない
 * （唯一の例外は下記テスト3 の欠落区間で、理由をその場に書いている）。
 *
 * かつては setInterval/clearInterval だけをフェイクタイマー化していたが、bun:test では
 * 同じことができない（いずれも 2026-08-05 に実測）。
 *
 * - `useFakeTimers` に toFake 相当の選択指定が無く、setImmediate も Bun.sleep も止まる。
 *   そのため「ping を送ったあと実ソケットの pong 往復を捌く猶予」を作れない
 * - `useRealTimers()` → `useFakeTimers()` と往復すると、保留中の setInterval が失われる。
 *   アダプタのハートビートそのものが死ぬので、猶予を挟んでから進めることもできない
 *
 * 経過時間ではなく ping の実送信を根拠にするため、advance するだけの検証より強い
 * （advance は ping が実際に飛んだことを保証しない）。
 *
 * ## クライアント: 生 TCP で pong を 1 回ずつ制御する
 *
 * ws クライアントでは「pong を返さない接続」を作れない。**Bun の ws は `pause()` が
 * 未実装で、`autoPong: false` も無視される**ため、必ず自動 pong を返してしまう
 * （2026-08-05 実測。pause で半開きを作る旧テストは、Bun では「欠落しない」まま
 * 緑になる偽陽性だった）。そこでハンドシェイクだけを手で行う生ソケットを使い、
 * 「何回目の ping に pong を返すか」を直接指定する。旧テストが pause という代理手段で
 * 表していた条件を、要件の言葉そのままで書ける。
 */
import { describe, it, expect, afterEach, jest } from "bun:test";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

const PORT = 18791; // テスト専用ポート（integration/admin と重複しない値）

let adapter: WsAdapter | undefined;
const openClients: RawClient[] = [];

afterEach(async () => {
  for (const client of openClients) client.close();
  openClients.length = 0;
  await adapter?.close();
  adapter = undefined;
});

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

interface RawClient {
  /** サーバーから ping を受けた回数が count に達するまで待つ。 */
  waitForPings: (count: number, timeoutMs?: number) => Promise<void>;
  /**
   * pong を返さなかった ping の回数。
   * サーバーは「連続の欠落が許容回数に達したら切断」するので、この値が
   * **切断までに何回の欠落を許したか**そのものになる（閾値の直接観測）。
   */
  readonly unansweredPingCount: number;
  close: () => void;
}

/**
 * WebSocket のハンドシェイクだけを手で行う生 TCP クライアント。
 *
 * @param shouldPong n 回目（1 始まり）の ping に pong を返すかどうか
 */
function connectRaw(
  port: number,
  shouldPong: (nth: number) => boolean,
): Promise<RawClient> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      const key = randomBytes(16).toString("base64");
      socket.write(
        `GET / HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.once("error", reject);

    let handshakeDone = false;
    let pingsSeen = 0;
    let unansweredPings = 0;
    let waiter: { need: number; resolve: () => void; timer: NodeJS.Timeout } | undefined;

    socket.on("data", (chunk: Buffer) => {
      let buf = chunk;
      if (!handshakeDone) {
        const head = buf.toString("latin1");
        const sep = head.indexOf("\r\n\r\n");
        if (sep === -1) return; // ヘッダーが分割された場合は次のチャンクを待つ
        if (!head.startsWith("HTTP/1.1 101")) {
          reject(new Error(`Upgrade に失敗: ${head.split("\r\n")[0]}`));
          return;
        }
        handshakeDone = true;
        buf = buf.subarray(sep + 4); // 同じチャンクに乗ってきたフレームは続けて処理する
        resolve(client);
      }

      for (const opcode of readOpcodes(buf)) {
        if (opcode !== OPCODE_PING) continue;
        pingsSeen += 1;
        if (shouldPong(pingsSeen)) socket.write(maskedPongFrame());
        else unansweredPings += 1;
        if (waiter && pingsSeen >= waiter.need) {
          clearTimeout(waiter.timer);
          waiter.resolve();
          waiter = undefined;
        }
      }
    });

    const client: RawClient = {
      get unansweredPingCount() {
        return unansweredPings;
      },
      waitForPings: (count, timeoutMs = 3_000) =>
        new Promise((res, rej) => {
          if (pingsSeen >= count) {
            res();
            return;
          }
          const timer = setTimeout(
            () => rej(new Error(`ping が ${count} 回来なかった（${pingsSeen} 回で打ち切り）`)),
            timeoutMs,
          );
          waiter = { need: count, resolve: res, timer };
        }),
      close: () => {
        if (waiter) clearTimeout(waiter.timer);
        socket.destroy();
      },
    };
  });
}

const OPCODE_PING = 0x9;

/**
 * サーバーから届いたフレーム列の opcode を順に返す。
 *
 * サーバー → クライアントの方向はマスクされないため、ヘッダーは
 * 「1 バイト目に FIN+opcode、2 バイト目に長さ（126/127 なら拡張長）」だけで読める。
 */
function readOpcodes(buf: Buffer): number[] {
  const opcodes: number[] = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const opcode = buf[offset]! & 0x0f;
    const lengthByte = buf[offset + 1]! & 0x7f;
    let headerLength = 2;
    let payloadLength = lengthByte;
    if (lengthByte === 126) {
      if (offset + 4 > buf.length) break;
      payloadLength = buf.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (lengthByte === 127) {
      if (offset + 10 > buf.length) break;
      payloadLength = Number(buf.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    opcodes.push(opcode);
    offset += headerLength + payloadLength;
  }
  return opcodes;
}

/** 空ペイロードの pong フレーム。クライアント → サーバーはマスクが必須。 */
function maskedPongFrame(): Buffer {
  return Buffer.concat([Buffer.from([0x8a, 0x80]), randomBytes(4)]);
}

/** テストで使う生クライアントを開き、afterEach での後始末に登録する。 */
async function openClient(shouldPong: (nth: number) => boolean): Promise<RawClient> {
  const client = await connectRaw(PORT, shouldPong);
  openClients.push(client);
  return client;
}

describe("WsAdapter ハートビート（死活監視・Issue #25）", () => {
  it.each([2, 4])(
    "pong を一切返さない接続は許容ミス %i 回ぶんで terminate され、onDisconnect が発火する",
    async (maxMisses) => {
      // Given: 許容ミス回数を変えたハートビートを持つアダプタ
      const { promise, onDisconnect } = waitDisconnect(5_000);
      adapter = new WsAdapter({
        port: PORT,
        host: "127.0.0.1",
        allowedOrigins: [],
        heartbeatIntervalMs: 50,
        heartbeatMaxMisses: maxMisses,
        onMessage: async () => {},
        onDisconnect,
      });

      // When: pong を一切返さない接続（半開きの再現）を作る。
      const client = await openClient(() => false);

      // Then: 欠落を重ねたのち検出され onDisconnect が発火する
      expect(await promise).toBeDefined();

      // And: **何回の欠落で切断されたか**を固定する。
      // 「いつか切断される」だけを見ると、許容回数を緩める退行（>= を > にする、
      // 上限に足す等）を検出できない。サーバーは欠落が許容回数に達した時点で切るので、
      // pong を返さなかった ping の数が許容回数そのものになる。
      expect(client.unansweredPingCount).toBe(maxMisses);
    },
  );

  it("terminate された接続の connId が onDisconnect に渡る", async () => {
    // Given
    const { promise, onDisconnect } = waitDisconnect(5_000);
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      heartbeatIntervalMs: 50,
      heartbeatMaxMisses: 2,
      onMessage: async () => {},
      onDisconnect,
    });

    // When
    await openClient(() => false);

    // Then
    const disconnectedConnId = await promise;
    expect(disconnectedConnId).toBeDefined();
  });

  it("pong を返し続ける接続は許容ミス回数を超えても terminate されない", async () => {
    // Given
    let disconnected = false;
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      // 間隔は pong の往復より十分に長く取る。20ms だと CI の負荷でスケジューリングが
      // 1 間隔ぶん遅れたときに「連続の欠落」と誤判定され、terminate されて落ちる。
      heartbeatIntervalMs: 100,
      heartbeatMaxMisses: 2,
      onMessage: async () => {},
      onDisconnect: () => {
        disconnected = true;
      },
    });
    const client = await openClient(() => true);

    // When: 許容ミス回数（2回）を大きく超える10 回分の ping 往復が起きるまで待つ
    await client.waitForPings(10, 10_000);

    // Then
    expect(disconnected).toBe(false);
  });

  it("1回だけ pong が欠落し、その後 pong が復帰した接続は terminate されない（US2: 誤検出しない）", async () => {
    // Given: 2 回目の ping にだけ pong を返さない
    let disconnected = false;
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      // 間隔は pong の往復より十分に長く取る（上のテストと同じ理由）。
      // ここは「1 回だけ欠落しても切らない」を見るテストなので、間隔が短いと
      // 意図しない 2 回目の欠落が混ざり、検証したい条件そのものが崩れる。
      heartbeatIntervalMs: 100,
      heartbeatMaxMisses: 2,
      onMessage: async () => {},
      onDisconnect: () => {
        disconnected = true;
      },
    });
    const client = await openClient((nth) => nth !== 2);

    // When: 欠落を挟んで 8 回分の ping 往復が起きるまで待つ
    await client.waitForPings(8, 10_000);

    // Then: 1 回の欠落では誤検出しない
    expect(disconnected).toBe(false);
  });

  it("close() は heartbeat の setInterval を停止する（clearInterval を呼ぶ）", async () => {
    // Given: setInterval/clearInterval は素の実装（フェイク化しない）のまま、
    // close() が実際に clearInterval を呼ぶことを spy で直接検証する。
    // 「close 後に ping が増えない」という間接的な観測は、close() が接続を
    // terminate 済みで connections が空になるため、clearInterval を呼ばなくても
    // 偽陽性で緑になってしまう（タイマー自体は動き続けても検知できない）。
    // そのため stopHeartbeat の呼び出しそのものを直接検証する。
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

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
