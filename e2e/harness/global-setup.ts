/**
 * ハーネスの組み立て。
 *
 * production ターゲットでは**何も起動しない**。既に動いているサーバーへ
 * 外から当てるだけなので、ここは素通りする。
 *
 * ## 後始末について
 *
 * 正常終了・テスト失敗・SIGINT・SIGTERM では必ず解放する。
 * **SIGKILL では保証できない**（プロセスがハンドラを実行できないため）。
 * そのため preflight が残骸を必ず検出して落とすようにしてある。
 * 「次回起動時に気づける」ことで、この穴を埋めている。
 */
import type { ChildProcess } from 'node:child_process';
import { ensureCaddyBinary, installCaddyConfig, removeCaddyConfig, startCaddy, stopCaddy } from './caddy';
import { runPreflight } from './preflight';
import { startSyncServers, stopSyncServers } from './sync';
import { linkWebRoots, unlinkWebRoots } from './www';
import { resolveTarget } from './target';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const target = resolveTarget(process.env);
  if (target.kind === 'production') {
    return async () => {
      /* 起動していないので何もしない */
    };
  }

  await runPreflight(process.env);

  const binary = await ensureCaddyBinary();
  let syncProcs: ChildProcess[] = [];
  let caddyProc: ChildProcess | undefined;
  let stopped = false;

  const teardown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (caddyProc !== undefined) await stopCaddy(caddyProc);
    await stopSyncServers(syncProcs);
    removeCaddyConfig();
    unlinkWebRoots();
  };

  // Ctrl-C / kill でも解放する。SIGKILL は捕捉できないため preflight に委ねる。
  process.once('SIGINT', () => void teardown().then(() => process.exit(130)));
  process.once('SIGTERM', () => void teardown().then(() => process.exit(143)));

  try {
    linkWebRoots();
    installCaddyConfig();
    syncProcs = await startSyncServers();
    caddyProc = await startCaddy(binary);
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}
