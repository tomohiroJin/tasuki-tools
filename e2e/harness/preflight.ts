/**
 * 起動前の検査。**1 つでも該当したら起動しない。**
 *
 * 黙って混ざるのが最悪の結果なので、迷ったら落とす方に倒す。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { assertChromiumInstalled } from './browsers';
import { CADDY_ETC_DIR, PORTS, WEB_ROOTS } from './paths';
import { resolveTarget } from './target';

/** 指定ポートのうち、bind できなかったものを返す。 */
export async function findBusyPorts(ports: readonly number[]): Promise<number[]> {
  const busy: number[] = [];
  for (const port of ports) {
    const isFree = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (!isFree) busy.push(port);
  }
  return busy;
}

/** 誰がポートを掴んでいるかを調べる。ss が無い環境でも落ちないようにする。 */
export function describePortHolders(ports: readonly number[]): string {
  try {
    const output = execFileSync('ss', ['-tlnp'], { encoding: 'utf8' });
    const lines = output
      .split('\n')
      .filter((line) => ports.some((port) => line.includes(`:${port} `)));
    return lines.length > 0 ? lines.join('\n') : '（ss の出力に該当行が見つかりませんでした）';
  } catch {
    return '（ss コマンドが使えないため、掴んでいるプロセスを特定できませんでした）';
  }
}

export async function assertPortsFree(ports: readonly number[]): Promise<void> {
  const busy = await findBusyPorts(ports);
  if (busy.length === 0) return;
  throw new Error(
    `ポートが使用中です: ${busy.join(', ')}\n` +
      '`pnpm dev` が動いているか、前回の E2E の残骸が残っています。\n' +
      `${describePortHolders(busy)}`,
  );
}

/**
 * 前回の残骸、あるいはこのマシンの本物の Caddy 設定を検出する。
 *
 * **どちらか区別できないので、存在したら必ず落とす。** 他人の設定を壊さないため。
 */
export function assertNoCaddyLeftovers(): void {
  if (!existsSync(CADDY_ETC_DIR)) return;
  throw new Error(
    `${CADDY_ETC_DIR} が既に存在します。\n` +
      '前回の E2E が異常終了した残骸か、このマシンの本物の Caddy 設定です。\n' +
      `中身を確認したうえで、残骸であれば \`sudo rm -rf ${CADDY_ETC_DIR}\` してください。`,
  );
}

/**
 * `/var/www/*` に本物のディレクトリが居ないかを確認する。
 *
 * symlink なら前回の残骸なので張り替えてよい。実ディレクトリは本物のサイトなので触らない。
 */
export function assertWebRootsSafe(): void {
  for (const { link } of WEB_ROOTS) {
    if (!existsSync(link)) continue;
    if (lstatSync(link).isSymbolicLink()) continue;
    throw new Error(
      `${link} が symlink ではなく実体として存在します。\n` +
        'このマシンで実際に配信している可能性があるため、E2E は触りません。',
    );
  }
}

export function assertDistsBuilt(): void {
  const missing = WEB_ROOTS.filter(({ dist }) => !existsSync(path.join(dist, 'index.html'))).map(
    ({ dist }) => dist,
  );
  if (missing.length === 0) return;
  throw new Error(
    `ビルド成果物がありません:\n${missing.join('\n')}\n` + '`pnpm build` を先に実行してください。',
  );
}

/** すべての検査をまとめて実行する。 */
export async function runPreflight(env: Record<string, string | undefined>): Promise<void> {
  resolveTarget(env); // ターゲットの取り違えをここでも落とす
  assertChromiumInstalled(env);
  assertNoCaddyLeftovers();
  assertWebRootsSafe();
  assertDistsBuilt();
  await assertPortsFree([PORTS.caddy, PORTS.timerSync, PORTS.pokerSync]);
}
