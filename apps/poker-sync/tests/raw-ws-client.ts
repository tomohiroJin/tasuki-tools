/**
 * ハンドシェイクを手で行う生 TCP の WebSocket クライアント（Issue #63 のテスト用）。
 *
 * 通常のクライアント（`WsClient`）では作れない条件が 2 つあるため必要になる。
 *
 * 1. **Origin ヘッダを指定できない。** テストは vitest（Node）上で走り、Node 組み込みの
 *    WebSocket はコンストラクタでリクエストヘッダを足せない
 * 2. **pong を返さない接続を作れない。** Bun の WebSocket は `autoPong: false` を無視して
 *    必ず pong を返す（2026-08-05 実測）。半開き接続を再現できず、死活監視のテストが
 *    「欠落が起きないまま緑」という偽陽性になる
 *
 * 送信するのは短いフレームだけなので、マスク付きの基本長（125 バイト以下）のみ実装する。
 * 受信は拡張長（126 / 127）も読む。
 */
import net from 'node:net';
import { randomBytes } from 'node:crypto';

const OPCODE_TEXT = 0x1;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;

export interface CloseInfo {
  code: number;
  reason: string;
}

export interface RawWsClient {
  /** これまでにサーバーから受けた ping の回数。相対的な待ちを組み立てるのに使う。 */
  readonly pingCount: number;
  /**
   * pong を返さなかった ping の回数。
   * サーバーは「連続の欠落が許容回数に達したら切断」するので、この値が
   * **切断までに何回の欠落を許したか**そのものになる（閾値の直接観測）。
   */
  readonly unansweredPingCount: number;
  /** サーバーから ping を受けた回数が count に達するまで待つ。 */
  waitForPings: (count: number, timeoutMs?: number) => Promise<void>;
  /** サーバーから close フレームを受け取るまで待ち、コードと理由を返す。 */
  waitForClose: (timeoutMs?: number) => Promise<CloseInfo>;
  /** 次のテキストメッセージを 1 件 JSON として取り出す。 */
  nextText: (timeoutMs?: number) => Promise<unknown>;
  /** テキストフレームを送る（125 バイト以下）。 */
  send: (msg: unknown) => void;
  close: () => void;
}

export interface RawConnectOptions {
  /** 送出する Origin ヘッダ。未指定ならヘッダ自体を送らない。 */
  origin?: string;
  /** X-Forwarded-For ヘッダの値。省略すると送らない（Caddy 迂回の直結を模す）。 */
  forwardedFor?: string;
  /**
   * X-Real-Ip ヘッダの値。省略すると送らない。
   * **攻撃者が自由に付けられるヘッダ**（`packages/rate-limit/src/client-key.ts` の
   * docstring）を模す。レート制限の鍵の材料には使われないことを固定するテスト用
   * （最終レビュー W-1）。
   */
  xRealIp?: string;
  /** n 回目（1 始まり）の ping に pong を返すか。既定は常に返す。 */
  shouldPong?: (nth: number) => boolean;
}

/** 受信バッファから 1 フレーム読み出す。足りなければ null。 */
function readFrame(buf: Buffer): { opcode: number; payload: Buffer; rest: Buffer } | null {
  if (buf.length < 2) return null;
  const opcode = buf[0]! & 0x0f;
  const lengthByte = buf[1]! & 0x7f;
  let headerLength = 2;
  let payloadLength = lengthByte;
  if (lengthByte === 126) {
    if (buf.length < 4) return null;
    payloadLength = buf.readUInt16BE(2);
    headerLength = 4;
  } else if (lengthByte === 127) {
    if (buf.length < 10) return null;
    payloadLength = Number(buf.readBigUInt64BE(2));
    headerLength = 10;
  }
  if (buf.length < headerLength + payloadLength) return null;
  return {
    opcode,
    payload: buf.subarray(headerLength, headerLength + payloadLength),
    rest: buf.subarray(headerLength + payloadLength),
  };
}

/** クライアント → サーバーのフレームはマスクが必須。125 バイト以下のみ扱う。 */
function maskedFrame(opcode: number, payload: Buffer): Buffer {
  if (payload.length > 125) throw new Error('この簡易クライアントは 125 バイトまでしか送れません');
  const mask = randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] = masked[i]! ^ mask[i % 4]!;
  return Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | payload.length]), mask, masked]);
}

/** 期限つきで値を待つ小さなキュー。受信済みなら即座に返す。 */
class Pending<T> {
  private readonly queue: T[] = [];
  private waiter: { resolve: (v: T) => void; timer: NodeJS.Timeout } | undefined;

  push(value: T): void {
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.resolve(value);
      this.waiter = undefined;
      return;
    }
    this.queue.push(value);
  }

  next(timeoutMs: number, label: string): Promise<T> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} を待って時間切れ`)), timeoutMs);
      this.waiter = { resolve, timer };
    });
  }

  cancel(): void {
    if (this.waiter) clearTimeout(this.waiter.timer);
    this.waiter = undefined;
  }
}

export function connectRaw(port: number, options: RawConnectOptions = {}): Promise<RawWsClient> {
  const shouldPong = options.shouldPong ?? (() => true);

  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const key = randomBytes(16).toString('base64');
      const originLine = options.origin === undefined ? '' : `Origin: ${options.origin}\r\n`;
      const forwardedLine =
        options.forwardedFor === undefined ? '' : `X-Forwarded-For: ${options.forwardedFor}\r\n`;
      const xRealIpLine =
        options.xRealIp === undefined ? '' : `X-Real-Ip: ${options.xRealIp}\r\n`;
      socket.write(
        `GET /ws HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n` +
          originLine +
          forwardedLine +
          xRealIpLine +
          `\r\n`,
      );
    });
    socket.once('error', reject);

    let handshakeDone = false;
    // Buffer.concat の戻りは Buffer<ArrayBufferLike> なので、明示注釈で受け皿を合わせる
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let pingsSeen = 0;
    let unansweredPings = 0;
    const texts = new Pending<unknown>();
    const closes = new Pending<CloseInfo>();
    let pingWaiter: { need: number; resolve: () => void; timer: NodeJS.Timeout } | undefined;

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!handshakeDone) {
        const head = buffer.toString('latin1');
        const sep = head.indexOf('\r\n\r\n');
        if (sep === -1) return; // ヘッダーが分割された場合は次のチャンクを待つ
        if (!head.startsWith('HTTP/1.1 101')) {
          reject(new Error(`Upgrade に失敗: ${head.split('\r\n')[0]}`));
          return;
        }
        handshakeDone = true;
        buffer = buffer.subarray(sep + 4);
        resolve(client);
      }

      for (;;) {
        const frame = readFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;

        if (frame.opcode === OPCODE_TEXT) {
          texts.push(JSON.parse(frame.payload.toString('utf8')) as unknown);
        } else if (frame.opcode === OPCODE_CLOSE) {
          closes.push({
            code: frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005,
            reason: frame.payload.subarray(2).toString('utf8'),
          });
        } else if (frame.opcode === OPCODE_PING) {
          pingsSeen += 1;
          if (shouldPong(pingsSeen)) socket.write(maskedFrame(0xa, Buffer.alloc(0)));
          else unansweredPings += 1;
          if (pingWaiter && pingsSeen >= pingWaiter.need) {
            clearTimeout(pingWaiter.timer);
            pingWaiter.resolve();
            pingWaiter = undefined;
          }
        }
      }
    });

    const client: RawWsClient = {
      get pingCount() {
        return pingsSeen;
      },
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
          pingWaiter = { need: count, resolve: res, timer };
        }),
      waitForClose: (timeoutMs = 3_000) => closes.next(timeoutMs, 'close フレーム'),
      nextText: (timeoutMs = 3_000) => texts.next(timeoutMs, 'テキストメッセージ'),
      send: (msg) => socket.write(maskedFrame(OPCODE_TEXT, Buffer.from(JSON.stringify(msg)))),
      close: () => {
        if (pingWaiter) clearTimeout(pingWaiter.timer);
        texts.cancel();
        closes.cancel();
        socket.destroy();
      },
    };
  });
}
