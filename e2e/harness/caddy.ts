/**
 * Caddy の取得・設置・起動・撤去。
 *
 * ## なぜ設置（コピー）が要るのか
 *
 * `deploy/caddy/tasuki.conf` の import は **絶対パス固定**である。
 *
 *     import /etc/caddy/tasuki/apps/*.conf
 *
 * Caddyfile 側にこれを読み替える手段は無いので、断片を所定の場所へ置くしかない。
 * **置くだけで、内容は 1 バイトも変えない。**
 *
 * ## なぜ caddy validate を起動ゲートにしないのか
 *
 * import のグロブが 0 件マッチでも `Valid configuration` を返すため（実測）。
 * 断片が 1 本も読まれていない状態でも「通った」ことになってしまう。
 * 代わりに**設置した断片の数を数える**。
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CADDY_APPS_DIR,
  CADDY_CACHE_DIR,
  CADDY_ETC_DIR,
  CADDY_VERSION,
  FRAGMENT_SOURCES,
  LOG_DIR,
  PORTS,
  SITE_CONF_SOURCE,
  TEST_RESULTS_DIR,
} from './paths';
import { toLocalSiteConfig } from './site-config';
import { LOCAL_BASE_URL } from './target';
import { waitForPort } from './wait-for-port';

const CADDY_BINARY = path.join(CADDY_CACHE_DIR, 'caddy');
const CADDY_TARBALL_URL =
  `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}` +
  `/caddy_${CADDY_VERSION}_linux_amd64.tar.gz`;

/** 版を固定して取得し、キャッシュする。 */
export async function ensureCaddyBinary(): Promise<string> {
  if (existsSync(CADDY_BINARY)) return CADDY_BINARY;

  mkdirSync(CADDY_CACHE_DIR, { recursive: true });
  const tarball = path.join(CADDY_CACHE_DIR, 'caddy.tar.gz');
  execFileSync('curl', ['-fsSL', '-o', tarball, CADDY_TARBALL_URL], { stdio: 'inherit' });
  execFileSync('tar', ['-xzf', tarball, '-C', CADDY_CACHE_DIR, 'caddy'], { stdio: 'inherit' });
  execFileSync('chmod', ['+x', CADDY_BINARY]);
  return CADDY_BINARY;
}

/** ローカル用のトップ Caddyfile。本番のホスト側と同じく import 1 行だけ。 */
function writeTopCaddyfile(): string {
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  const filePath = path.join(TEST_RESULTS_DIR, 'Caddyfile');
  writeFileSync(filePath, `import ${CADDY_ETC_DIR}/site.conf\n`, 'utf8');
  return filePath;
}

/**
 * 断片 5 本と site.conf を設置する。
 *
 * 断片は内容を変えずにコピーする。site.conf だけアドレス行 1 行を差し替える。
 */
export function installCaddyConfig(): void {
  execFileSync('sudo', ['mkdir', '-p', CADDY_APPS_DIR]);

  for (const source of FRAGMENT_SOURCES) {
    execFileSync('sudo', ['install', '-m', '644', source, CADDY_APPS_DIR]);
  }

  const localSiteConf = toLocalSiteConfig(readFileSync(SITE_CONF_SOURCE, 'utf8'), LOCAL_BASE_URL);
  const staged = path.join(TEST_RESULTS_DIR, 'site.conf');
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  writeFileSync(staged, localSiteConf, 'utf8');
  execFileSync('sudo', ['install', '-m', '644', staged, path.join(CADDY_ETC_DIR, 'site.conf')]);

  // caddy validate は import が 0 件でも成功するため、設置数を自分で数える。
  const installed = execFileSync('sudo', ['ls', '-1', CADDY_APPS_DIR], { encoding: 'utf8' })
    .split('\n')
    .filter((name) => name.endsWith('.conf'));
  if (installed.length !== FRAGMENT_SOURCES.length) {
    throw new Error(
      `断片の設置数が合いません（期待 ${FRAGMENT_SOURCES.length} / 実際 ${installed.length}）: ${installed.join(', ')}`,
    );
  }
}

export function removeCaddyConfig(): void {
  execFileSync('sudo', ['rm', '-rf', CADDY_ETC_DIR]);
}

export async function startCaddy(binaryPath: string): Promise<ChildProcess> {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(path.join(LOG_DIR, 'caddy.log'), { flags: 'w' });
  const proc = spawn(binaryPath, ['run', '--config', writeTopCaddyfile(), '--adapter', 'caddyfile'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(log);
  proc.stderr.pipe(log);
  await waitForPort(PORTS.caddy, 15_000);
  return proc;
}

export async function stopCaddy(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => proc.kill('SIGKILL'), 5_000);
  });
}
