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
import { buildWebApps } from './build';
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

  // **preflight より前に置く。** 配信するのは「ここで作った成果物」であって、
  // 「そのとき置いてあったもの」ではない。turbo 経由（`pnpm e2e`）なら
  // `dependsOn: ["^build"]` で済んだビルドを引き当てて即座に戻り、turbo を
  // 経由しない VSCode の拡張から実行したときだけ実際に走る（#162）。
  buildWebApps();

  await runPreflight(process.env);

  const binary = await ensureCaddyBinary();
  let syncProcs: ChildProcess[] = [];
  let caddyProc: ChildProcess | undefined;
  let stopped = false;
  let filesCleaned = false;
  /** 起動処理。teardown はこれの完了を待ってから片付ける。 */
  let startup: Promise<void> | undefined;

  /**
   * 同期でできる後始末。**何も待たずに完了する**ことが要点。
   *
   * シグナル経路では、プロセスの停止を待つ前にこれを済ませる。待ってから
   * 片付けようとすると、起動途中（Caddy が spawn 済みで listen 前）に信号が来たとき
   * waitForPort が最大 15 秒粘り、その間に外側の pnpm / turbo が Node ごと
   * 落として後始末に到達しないことがありうる。
   */
  const cleanupFiles = (): void => {
    if (filesCleaned) return;
    filesCleaned = true;
    removeCaddyConfig();
    unlinkWebRoots();
  };

  const teardown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    // **起動が進行中なら、まず終わるのを待つ。** 待たずに片付けると、
    // 起動途中に生まれたプロセスを変数に掴む前に teardown が走り、
    // Caddy や sync が孤児として残ってポートを握り続ける。
    // 起動自体が失敗していても、その中で自前の後始末は済んでいるので握り潰してよい。
    await startup?.catch(() => undefined);
    if (caddyProc !== undefined) await stopCaddy(caddyProc);
    await stopSyncServers(syncProcs);
    cleanupFiles();
  };

  // Ctrl-C / kill でも解放する。SIGKILL は捕捉できないため preflight に委ねる。
  // **ファイルの後始末を先に、同期で済ませる。** プロセス自体はグループへの
  // シグナルで落ちるので、そちらは best-effort でよい。
  const onSignal = (exitCode: number): void => {
    cleanupFiles();
    void teardown().finally(() => process.exit(exitCode));
  };
  process.once('SIGINT', () => onSignal(130));
  process.once('SIGTERM', () => onSignal(143));

  startup = (async () => {
    linkWebRoots();
    installCaddyConfig();
    syncProcs = await startSyncServers();
    caddyProc = await startCaddy(binary);
  })();

  try {
    await startup;
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}
