/**
 * timer-sync / poker-sync を Bun で起動する。
 *
 * ポートは本番と同じ 8787 / 3311。断片が絶対値で宣言しているため変えられない。
 *
 * ALLOWED_ORIGINS にはローカルの入口 URL を渡す。両サーバーとも空で起動を
 * 拒否するのは NODE_ENV=production のときだけだが、Origin 検査を本番と同じ形で
 * 働かせるために明示的に渡す。
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

  for (const server of SYNC_SERVERS) {
    const log = createWriteStream(path.join(LOG_DIR, `${server.name}.log`), { flags: 'w' });
    const proc = spawn('bun', ['run', server.entry], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(server.port),
        HOST: '127.0.0.1',
        ALLOWED_ORIGINS: LOCAL_BASE_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.pipe(log);
    proc.stderr.pipe(log);
    procs.push(proc);
  }

  try {
    await Promise.all(SYNC_SERVERS.map((server) => waitForPort(server.port, 20_000)));
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
