/**
 * ハーネスが触る場所の一覧。
 *
 * ここに集約する理由は 2 つ。1 つは後始末で消す対象を取りこぼさないため。
 * もう 1 つは、e2e/package.json が 4 つの web アプリを workspace 依存として
 * 宣言している理由がここを読めば分かるようにするため —— **コードとしては
 * 使わないが、turbo の `^build` に「先にビルドせよ」と伝えるための宣言**であり、
 * 実際に読むのは下の WEB_ROOTS が指す dist だけである。
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

export const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

/** 配信元の symlink と、対応するビルド成果物の組。 */
export interface WebRoot {
  readonly link: string;
  readonly dist: string;
}

/** Caddy 断片が絶対値で宣言している配信元と、実際の成果物の対応。 */
export const WEB_ROOTS: readonly WebRoot[] = [
  { link: '/var/www/tasuki', dist: path.join(REPO_ROOT, 'apps/timer-web/dist') },
  { link: '/var/www/tasuki-poker', dist: path.join(REPO_ROOT, 'apps/poker-web/dist') },
  { link: '/var/www/tasuki-home', dist: path.join(REPO_ROOT, 'apps/landing/dist') },
  // #91 PR 2
  { link: '/var/www/tasuki-topic', dist: path.join(REPO_ROOT, 'apps/topic-web/dist') },
  // #94 PR 2
  { link: '/var/www/tasuki-roulette', dist: path.join(REPO_ROOT, 'apps/roulette-web/dist') },
  // #429
  { link: '/var/www/tasuki-agenda', dist: path.join(REPO_ROOT, 'apps/agenda-web/dist') },
  // #406
  { link: '/var/www/tasuki-checkin', dist: path.join(REPO_ROOT, 'apps/checkin-web/dist') },
];

/** 経路の正本。ローカルコピーの上流と配信元だけを変換する。 */
export const FRAGMENT_SOURCES: readonly string[] = [
  // #95 S5a: ハブ（選択画面）の WS。旧救済断片（40-timer-legacy-room.conf）は同じ段で消えた。
  // #95 S5c: 唯一の WS 入口になった（旧 10-timer-ws.conf は撤去した）。
  'deploy/landing/caddy/05-hub-ws.conf',
  'deploy/poker/caddy/20-poker.conf',
  'deploy/timer/caddy/30-timer-spa.conf',
  // #91 PR 2
  'deploy/topic/caddy/40-topic.conf',
  // #94 PR 2
  'deploy/roulette/caddy/50-roulette.conf',
  // #429
  'deploy/agenda/caddy/60-agenda.conf',
  // #406
  'deploy/checkin/caddy/70-checkin.conf',
  'deploy/landing/caddy/90-landing.conf',
].map((rel) => path.join(REPO_ROOT, rel));

export const SITE_CONF_SOURCE = path.join(REPO_ROOT, 'deploy/caddy/tasuki.conf');

// 親が決めた実行 ID とポートを worker が引き継ぐ。同じ checkout でも結果を共有しない。
const local = process.env['TASUKI_E2E_TARGET'] === 'local';
if (local) process.env['TASUKI_E2E_RUN_ID'] ??= randomUUID();
const runId = process.env['TASUKI_E2E_RUN_ID'];
if (runId !== undefined && !/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('Invalid E2E run ID');
export const TEST_RESULTS_DIR = path.join(REPO_ROOT, 'e2e/test-results', ...(runId ? [runId] : []));

/** 実行専用の設定。生成コピーの import をここへ向ける。 */
export const CADDY_ETC_DIR = path.join(TEST_RESULTS_DIR, 'config');
export const CADDY_APPS_DIR = path.join(CADDY_ETC_DIR, 'apps');


export const LOG_DIR = path.join(TEST_RESULTS_DIR, 'logs');

/**
 * Caddy の版は固定する。「最新」を取ると、ある日突然赤くなって原因が分からない。
 * 版は本番（Caddy 公式の apt の caddy）に揃える。本番が Debian の 2.6.2 で E2E が 2.11.4 だったときは、
 * 2.6.2 では効かない `header { match status 2xx }` が緑のまま本番へ出た（#434）。
 * 本番の Caddy を上げたら、ここを同じ版へ上げる（CI のキャッシュの鍵はここから導く。
 * 手順は deploy/README.md の「Caddy を上げる」）。CI はこの行を sed で読むので、形を変えない。
 */
export const CADDY_VERSION = '2.11.7';
export const CADDY_CACHE_DIR = path.join(
  process.env['HOME'] ?? '/tmp',
  '.cache/tasuki-e2e',
  `caddy-${CADDY_VERSION}`,
);

/** OS に空きポートを選ばせる。2 本同時に bind し、同じ番号を選ぶことを防ぐ。 */
function automaticPorts(): number[] {
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    const net = require('node:net');
    const servers = [net.createServer(), net.createServer()];
    Promise.all(servers.map(s => new Promise((resolve, reject) => {
      s.once('error', reject);
      s.listen(0, '127.0.0.1', () => resolve(s.address().port));
    }))).then(ports => { console.log(JSON.stringify(ports)); servers.forEach(s => s.close()); });
  `], { encoding: 'utf8' })) as number[];
}
function port(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return Number(raw);
}
const automatic = local ? automaticPorts() : [18080, 8787];
export const PORTS = {
  caddy: port('TASUKI_E2E_CADDY_PORT', automatic[0]!),
  sync: port('TASUKI_E2E_SYNC_PORT', automatic[1]!),
};
if (PORTS.caddy === PORTS.sync) throw new Error('E2E ports must be distinct');
if (local) {
  process.env['TASUKI_E2E_CADDY_PORT'] = String(PORTS.caddy);
  process.env['TASUKI_E2E_SYNC_PORT'] = String(PORTS.sync);
}
