// 結合テスト基盤（research R7）:
// Bun.serve は Bun ランタイム専用のため、`bun run` でサーバーをサブプロセス起動し、
// ポート 0 → 標準出力 1 行 JSON（{"event":"listening","port":N}）で実ポートを受け取る。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APP_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export interface TestServer {
  port: number;
  stop: () => Promise<void>;
}

/**
 * サーバーをサブプロセス起動する。
 *
 * @param env 上書きする環境変数。サーバーは in-process では起動できない（Bun.serve は
 *   Bun ランタイム専用）ため、上限値やハートビート間隔の注入経路は env しかない。
 */
export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  const proc = spawn('bun', ['run', 'src/server.ts'], {
    cwd: APP_ROOT,
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  const port = await new Promise<number>((resolve, reject) => {
    let stdoutBuf = '';
    const timer = setTimeout(() => {
      reject(new Error(`server did not start in time. stderr: ${stderrBuf}`));
    }, 10_000);
    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const line = stdoutBuf.split('\n').find((l) => l.includes('"listening"'));
      if (line) {
        clearTimeout(timer);
        resolve((JSON.parse(line) as { port: number }).port);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}). stderr: ${stderrBuf}`));
    });
  });

  return {
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        proc.once('exit', () => resolve());
        proc.kill();
      }),
  };
}

/** 受信メッセージをキューに貯め、順番に取り出せる WS テストクライアント */
export class WsClient {
  private queue: unknown[] = [];
  private waiters: Array<(msg: unknown) => void> = [];
  private constructor(private ws: WebSocket) {}

  static async connect(port: number): Promise<WsClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = new WsClient(ws);
    ws.addEventListener('message', (event) => {
      const msg: unknown = JSON.parse(String(event.data));
      const waiter = client.waiters.shift();
      if (waiter) waiter(msg);
      else client.queue.push(msg);
    });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('WS connect failed')), { once: true });
    });
    return client;
  }

  /** 生テキストをそのまま送る（不正メッセージテスト用） */
  sendRaw(raw: string): void {
    this.ws.send(raw);
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** 次の受信メッセージを 1 件取り出す */
  next(timeoutMs = 5_000): Promise<unknown> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no message received in time')), timeoutMs);
      this.waiters.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  /** 条件に合うメッセージが来るまで読み飛ばして取り出す */
  async nextMatching(
    predicate: (msg: unknown) => boolean,
    timeoutMs = 5_000,
  ): Promise<unknown> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const msg = await this.next(Math.max(1, deadline - Date.now()));
      if (predicate(msg)) return msg;
    }
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  /** サーバーに接続を閉じられるまで待つ */
  waitForClose(timeoutMs = 5_000): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('接続が閉じられなかった')), timeoutMs);
      this.ws.addEventListener(
        'close',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  close(): void {
    this.ws.close();
  }
}

export function isType(type: string): (msg: unknown) => boolean {
  return (msg) => (msg as { type?: string }).type === type;
}
