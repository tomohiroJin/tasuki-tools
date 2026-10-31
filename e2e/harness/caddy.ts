/** 実行ごとの Caddy 設定を生成し、起動・撤去する。本番の断片は変更しない。 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  WEB_ROOTS,
} from './paths';
import { toLocalFragment, toLocalSiteConfig } from './site-config';
import { LOCAL_BASE_URL } from './target';
import { waitForPort } from './wait-for-port';

const CADDY_BINARY = path.join(CADDY_CACHE_DIR, 'caddy');
const CADDY_RELEASE_URL = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}`;
const CADDY_TARBALL_NAME = `caddy_${CADDY_VERSION}_linux_amd64.tar.gz`;
const CADDY_TARBALL_URL = `${CADDY_RELEASE_URL}/${CADDY_TARBALL_NAME}`;
const CADDY_CHECKSUMS_URL = `${CADDY_RELEASE_URL}/caddy_${CADDY_VERSION}_checksums.txt`;

/**
 * 取得した tarball を公式の checksums.txt（sha512）と照合する。
 * 版の文字列だけでは、差し替えられた配布物や途中で切れた取得を見分けられない。
 * 取得した本体は sudo で動かすので、展開する前に止める。
 */
function verifyTarball(tarball: string, checksums: string): void {
  const line = readFileSync(checksums, 'utf8')
    .split('\n')
    .find((l) => l.trim().endsWith(`  ${CADDY_TARBALL_NAME}`));
  const expected = line?.trim().split(/\s+/)[0];
  if (!expected) {
    throw new Error(`checksums.txt に ${CADDY_TARBALL_NAME} の行がありません。`);
  }
  const actual = createHash('sha512').update(readFileSync(tarball)).digest('hex');
  if (actual !== expected) {
    throw new Error(`取得した Caddy の sha512 が公式の値と違います（${CADDY_TARBALL_NAME}）。`);
  }
}

/** 版を固定して取得し、キャッシュする。 */
export async function ensureCaddyBinary(): Promise<string> {
  if (existsSync(CADDY_BINARY)) return CADDY_BINARY;

  mkdirSync(CADDY_CACHE_DIR, { recursive: true });
  // 最終配置先へ直接展開しない。途中で落ちると壊れたバイナリが残り、
  // 次回は existsSync が true を返して検証せずに使われてしまう。
  const staging = mkdtempSync(path.join(CADDY_CACHE_DIR, 'staging-'));
  const tarball = path.join(staging, 'caddy.tar.gz');
  const checksums = path.join(staging, 'checksums.txt');
  const stagedBinary = path.join(staging, 'caddy');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  try {
    execFileSync('curl', ['-fsSL', '-o', tarball, CADDY_TARBALL_URL], { stdio: 'inherit' });
    execFileSync('curl', ['-fsSL', '-o', checksums, CADDY_CHECKSUMS_URL], { stdio: 'inherit' });
    verifyTarball(tarball, checksums);
    execFileSync('tar', ['-xzf', tarball, '-C', staging, 'caddy'], { stdio: 'inherit' });
    execFileSync('chmod', ['+x', stagedBinary]);

    // 版を確かめてから所定の場所へ移す。取得先が変わって別の版が来ても気づける。
    const version = execFileSync(stagedBinary, ['version'], { encoding: 'utf8' });
    if (!version.startsWith(`v${CADDY_VERSION}`)) {
      throw new Error(`取得した Caddy の版が違います（期待 v${CADDY_VERSION} / 実際 ${version.trim()}）。`);
    }
    renameSync(stagedBinary, CADDY_BINARY);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  return CADDY_BINARY;
}

/** ローカル用のトップ Caddyfile。本番のホスト側と同じく import 1 行だけ。 */
function writeTopCaddyfile(): string {
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  const filePath = path.join(TEST_RESULTS_DIR, 'Caddyfile');
  writeFileSync(filePath, `{\n admin off\n auto_https off\n persist_config off\n}\nimport ${CADDY_ETC_DIR}/site.conf\n`, 'utf8');
  return filePath;
}

/**
 * 断片（`FRAGMENT_SOURCES`）と site.conf を設置する。
 *
 * コピーの上流ポート・配信元・import とサイトアドレスだけを差し替える。
 */
export function installCaddyConfig(): void {
  mkdirSync(CADDY_APPS_DIR, { recursive: true });
  for (const source of FRAGMENT_SOURCES) {
    writeFileSync(path.join(CADDY_APPS_DIR, path.basename(source)),
      toLocalFragment(readFileSync(source, 'utf8'), PORTS.sync, WEB_ROOTS));
  }
  const localSiteConf = toLocalSiteConfig(readFileSync(SITE_CONF_SOURCE, 'utf8'), LOCAL_BASE_URL)
    .replaceAll('/etc/caddy/tasuki/apps', CADDY_APPS_DIR);
  writeFileSync(path.join(CADDY_ETC_DIR, 'site.conf'), localSiteConf);
  const installed = readdirSync(CADDY_APPS_DIR).filter(name => name.endsWith('.conf'));
  if (installed.length !== FRAGMENT_SOURCES.length) {
    throw new Error(
      `断片の設置数が合いません（期待 ${FRAGMENT_SOURCES.length} / 実際 ${installed.length}）: ${installed.join(', ')}`,
    );
  }
}

export function removeCaddyConfig(): void {
  rmSync(CADDY_ETC_DIR, { recursive: true, force: true });
}

export async function startCaddy(binaryPath: string): Promise<ChildProcess> {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(path.join(LOG_DIR, 'caddy.log'), { flags: 'w' });
  const proc = spawn(binaryPath, ['run', '--config', writeTopCaddyfile(), '--adapter', 'caddyfile'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // **'error' リスナが無いと、バイナリが見つからない・実行できない等で
  // 未捕捉例外になりプロセスが即死する。** globalSetup の try/catch にも
  // シグナルハンドラにも入らないため、/etc/caddy/tasuki と symlink が残る。
  // waitForPort の起動待ちと競わせ、どちらか先に決着した方を採用する。
  const failure = new Promise<never>((_, reject) => {
    proc.once('exit', (code) => reject(new Error(`caddy exited during startup (${code}); see ${LOG_DIR}/caddy.log`)));
    proc.once('error', (cause: Error) => {
      reject(new Error(`caddy の起動に失敗しました: ${cause.message}`, { cause }));
    });
  });
  proc.stdout.pipe(log);
  proc.stderr.pipe(log);
  try {
    await Promise.race([waitForPort(PORTS.caddy, 15_000), failure]);
  } catch (error) {
    // 起動待ちに失敗しても、掴んだポートは必ず離す。
    // ここで放置すると次回の preflight が「ポート使用中」としか言えず、
    // 本当の原因（設定が壊れて起動できなかった）が見えなくなる。
    await stopCaddy(proc);
    throw error;
  }
  return proc;
}

export async function stopCaddy(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => proc.kill('SIGKILL'), 5_000);
    proc.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}
