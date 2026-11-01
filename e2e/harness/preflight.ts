/**
 * 起動前の検査。**1 つでも該当したら起動しない。**
 *
 * 黙って混ざるのが最悪の結果なので、迷ったら落とす方に倒す。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { assertChromiumInstalled } from './browsers';
import { PORTS, WEB_ROOTS, type WebRoot } from './paths';
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
      'TASUKI_E2E_CADDY_PORT と TASUKI_E2E_SYNC_PORT に別の空きポートを指定するか、unset して自動選択してください。\n' +
      `${describePortHolders(busy)}`,
  );
}

/**
 * `roots` は検査対象を差し替えるための引数（既定値は本番の定数）。
 */
export function assertDistsBuilt(roots: readonly WebRoot[] = WEB_ROOTS): void {
  const missing = roots.filter(({ dist }) => !existsSync(path.join(dist, 'index.html'))).map(
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

  assertDistsBuilt();
  await assertPortsFree([PORTS.caddy, PORTS.sync]);
}
