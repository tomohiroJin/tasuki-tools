// 結合テスト基盤（research R7）:
// `bun run` でサーバーをサブプロセス起動し、ポート 0 → 標準出力の "listening" 行から
// 実ポートを受け取る。
//
// **#95 S2 でサーバーが統合され、起動ログの形式が変わった。** 統合前の poker は
// `console.log(JSON.stringify({event:'listening',port:N}))` を出していたが、統合後は
// timer 側のロガー（`src/application/log/logger.ts`）が唯一の出口になり、
// `listening port=N loopbackOnly=true ...` という `event k=v` 形式で出る（ADR 0012 D1）。
// JSON.parse ではなく `port=` を読む形へ変えてある。
//
// **この helpers を使う既存テストは、いずれもサブプロセス起動のままである。**
// #165 PR-2 で `create-sync-server.ts` ができ、`createSyncServer(config)` を呼べば
// in-process でも起動できるようになった（`tests/create-sync-server.substitution.test.ts`
// がその経路を使う）。既存テストの in-process への移行は、振る舞い不変の証拠を
// 保つため本 PR では行わない。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** `apps/tasuki-sync`（`test/poker/` の 2 つ上）。統合で 1 段深くなった。 */
const APP_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

/**
 * poker のメッセージ層へ振り分けられる WS のパス（`src/adapters/ws-adapter.ts` の
 * `POKER_WS_PATH`）。**ここを `/ws` に戻すと timer 側へ流れ、poker のコマンドが
 * `INVALID_COMMAND` で弾かれる。**
 */
export const POKER_WS_PATH = '/poker/ws';

export interface TestServer {
  port: number;
  stop: () => Promise<void>;
  /**
   * サーバープロセスの標準出力を改行区切りで蓄積したもの（S-2〜S-4 のログ検証用）。
   * 起動後に出力された行も引き続き追記される。
   */
  stdoutLines: string[];
  /**
   * 標準エラー出力を改行区切りで蓄積したもの。
   *
   * **#95 S2 で行き先が変わったログがある。** 統合前の poker は拒否ログを
   * `console.log`（stdout）へ出していたが、統合サーバーの唯一の出口
   * （`src/adapters/console-log-sink.ts`）は水準で出し分け、`warn` / `error` は
   * stderr へ行く（ADR 0012 D1）。`conn-rejected` は warn なのでこちらに出る。
   * journald はどちらも拾うため運用上の見え方は変わらない。
   */
  stderrLines: string[];
}

/**
 * `event k=v k=v` 形式の 1 行を分解する（ADR 0012 D1 の整形。
 * 正本は `src/application/log/logger.ts` の `formatLine`）。
 *
 * **値はすべて文字列で返す。** 整形の時点で `String(v)` を通っており、
 * 真偽値と文字列 "true" の区別はログの側に無い。復元したふりをしない。
 */
export function parseLogLine(line: string): { event: string; fields: Record<string, string> } {
  const [event = '', ...rest] = line.split(' ');
  const fields: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return { event, fields };
}

/** 蓄積中の行配列から、条件に合う行が現れるまで待つ（無ければタイムアウトで失敗）。 */
export async function waitForLine(
  lines: readonly string[],
  predicate: (line: string) => boolean,
  timeoutMs = 3_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = lines.find(predicate);
    if (found !== undefined) return found;
    if (Date.now() >= deadline) {
      throw new Error(`waitForLine: 条件を満たす行が来なかった（既知の行: ${lines.join(' / ')}）`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * サーバーをサブプロセス起動する。
 *
 * @param env 上書きする環境変数。`src/server.ts` はモジュール読み込み時に `process.env` から
 *   config を読むので、**サブプロセス起動では**上限値やハートビート間隔の注入経路は env しかない。
 *   設定オブジェクトを直に渡したいときは `createSyncServer(config)` を in-process で呼ぶ
 *   （`tests/create-sync-server.substitution.test.ts` を参照）。
 */
export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  const proc = spawn('bun', ['run', 'src/server.ts'], {
    cwd: APP_ROOT,
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  const stderrLines: string[] = [];
  let stderrTail = '';
  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    stderrTail += chunk.toString();
    const parts = stderrTail.split('\n');
    stderrTail = parts.pop() ?? '';
    for (const part of parts) if (part.length > 0) stderrLines.push(part);
  });

  const stdoutLines: string[] = [];
  let stdoutTail = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutTail += chunk.toString();
    const parts = stdoutTail.split('\n');
    stdoutTail = parts.pop() ?? '';
    for (const part of parts) if (part.length > 0) stdoutLines.push(part);
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server did not start in time. stderr: ${stderrBuf}`));
    }, 10_000);
    const checkListening = () => {
      const line = stdoutLines.find((l) => l.startsWith('listening '));
      const matched = line === undefined ? null : /(?:^| )port=(\d+)(?: |$)/.exec(line);
      if (matched?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(Number(matched[1]));
      }
    };
    // 上の data ハンドラ（stdoutLines への蓄積）が先に登録されているため、
    // 同じチャンクに対してこのハンドラが呼ばれる時点で stdoutLines は反映済み。
    proc.stdout.on('data', checkListening);
    // `exit` は stdio が閉じる前に発火しうるため、stderrBuf が空のまま reject されることがある。
    // このテストハーネスの reject は **stderr の内容を含むこと**に依存している
    // （guards.test.ts の「ALLOWED_ORIGINS が空のまま本番起動しようとするとサーバーは
    // 起動しない」が `rejects.toThrow(/ALLOWED_ORIGINS/)` で中身を見る）。
    // `close` は stdio が閉じた後に発火するので、stderr を読み切ってから拒否できる。
    proc.on('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}). stderr: ${stderrBuf}`));
    });
  });

  return {
    port,
    stdoutLines,
    stderrLines,
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
    const ws = new WebSocket(`ws://127.0.0.1:${port}${POKER_WS_PATH}`);
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
