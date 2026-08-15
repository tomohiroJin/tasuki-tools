/**
 * timer-sync / poker-sync を Bun で起動する。
 *
 * ポートは本番と同じ 8787 / 3311。断片が絶対値で宣言しているため変えられない。
 *
 * ALLOWED_ORIGINS にはローカルの入口 URL を渡す。両サーバーとも空で起動を
 * 拒否するのは NODE_ENV=production のときだけだが、Origin 検査を本番と同じ形で
 * 働かせるために明示的に渡す。
 *
 * NODE_ENV=production も本番相当で渡す（#103）。この変数が効くのは両アプリとも
 * ALLOWED_ORIGINS の fail-closed・HOST のループバック限定・クライアント IP の
 * 必須化の 3 箇所（加えて未知の値なら起動時に throw）。正本は #103 設計正本。
 * ALLOWED_ORIGINS と HOST はこのハーネスが明示的に渡しているので、
 * 実質的にはクライアント IP 必須化を本番と同じ形で働かせるためにこれを渡している。**これを入れると、実 Caddy
 * 断片で X-Forwarded-For が届かない場合に全シナリオが落ちる。** それが狙いで、
 * 静かに防御が消えるより先に気づける。
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { LOG_DIR, PORTS, REPO_ROOT } from './paths';
import { LOCAL_BASE_URL } from './target';
import { waitForPort } from './wait-for-port';

interface SyncSpec {
  readonly name: string;
  readonly entry: string;
  readonly port: number;
}

const SYNC_SERVERS: readonly SyncSpec[] = [
  { name: 'timer-sync', entry: 'apps/timer-sync/src/server.ts', port: PORTS.timerSync },
  { name: 'poker-sync', entry: 'apps/poker-sync/src/server.ts', port: PORTS.pokerSync },
];

export async function startSyncServers(): Promise<ChildProcess[]> {
  mkdirSync(LOG_DIR, { recursive: true });
  const procs: ChildProcess[] = [];
  // spawn の 'error'（主に ENOENT）を Promise の失敗として拾うための集合。
  // waitForPort の起動待ちと競わせ、どちらか先に決着した方を採用する。
  const failures: Promise<never>[] = [];

  for (const server of SYNC_SERVERS) {
    const log = createWriteStream(path.join(LOG_DIR, `${server.name}.log`), { flags: 'w' });
    const proc = spawn('bun', ['run', server.entry], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(server.port),
        HOST: '127.0.0.1',
        ALLOWED_ORIGINS: LOCAL_BASE_URL,
        // 本番と同じ経路を通す（#103）。NODE_ENV が効くのは両アプリとも
        // ALLOWED_ORIGINS の fail-closed・HOST のループバック限定・クライアント IP の
        // 必須化の 3 箇所（加えて未知の値なら起動時に throw）。ALLOWED_ORIGINS と
        // HOST はすぐ上で渡しているので、ここで効くのはクライアント IP の必須化。
        // **これを入れると、実 Caddy 断片で X-Forwarded-For が届かない場合に
        // 全シナリオが落ちる。** それが狙いで、静かに防御が消えるより先に気づける。
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // **'error' リスナが無いと、bun が PATH に無いだけで未捕捉例外になり
    // プロセスが即死する。** globalSetup の try/catch にもシグナルハンドラにも
    // 入らないため、/etc/caddy/tasuki と symlink が残る。
    failures.push(
      new Promise<never>((_, reject) => {
        proc.once('error', (cause: Error) => {
          reject(new Error(`${server.name} の起動に失敗しました: ${cause.message}`, { cause }));
        });
      }),
    );
    proc.stdout.pipe(log);
    proc.stderr.pipe(log);
    procs.push(proc);
  }

  try {
    await Promise.race([
      Promise.all(SYNC_SERVERS.map((server) => waitForPort(server.port, 20_000))),
      ...failures,
    ]);
  } catch (error) {
    // 起動待ちに失敗しても、掴んだポートは必ず離す。
    await stopSyncServers(procs);
    throw error;
  }
  return procs;
}

export async function stopSyncServers(procs: readonly ChildProcess[]): Promise<void> {
  await Promise.all(
    procs.map(
      (proc) =>
        new Promise<void>((resolve) => {
          if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
          const forceKill = setTimeout(() => proc.kill('SIGKILL'), 5_000);
          proc.once('exit', () => {
            clearTimeout(forceKill);
            resolve();
          });
          proc.kill('SIGTERM');
        }),
    ),
  );
}
