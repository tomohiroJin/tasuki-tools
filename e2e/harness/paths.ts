/**
 * ハーネスが触る場所の一覧。
 *
 * ここに集約する理由は 2 つ。1 つは後始末で消す対象を取りこぼさないため。
 * もう 1 つは、e2e/package.json が 3 つの web アプリを workspace 依存として
 * 宣言している理由がここを読めば分かるようにするため —— **コードとしては
 * 使わないが、turbo の `^build` に「先にビルドせよ」と伝えるための宣言**であり、
 * 実際に読むのは下の WEB_ROOTS が指す dist だけである。
 */
import { existsSync } from 'node:fs';
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

/** Caddy 断片が絶対値で宣言している配信元と、実際の成果物の対応。 */
export const WEB_ROOTS: readonly { readonly link: string; readonly dist: string }[] = [
  { link: '/var/www/tasuki', dist: path.join(REPO_ROOT, 'apps/timer-web/dist') },
  { link: '/var/www/tasuki-poker', dist: path.join(REPO_ROOT, 'apps/poker-web/dist') },
  { link: '/var/www/tasuki-home', dist: path.join(REPO_ROOT, 'apps/landing/dist') },
];

/** 経路の本体。**内容を 1 バイトも書き換えずに**設置する。 */
export const FRAGMENT_SOURCES: readonly string[] = [
  'deploy/timer/caddy/10-timer-ws.conf',
  'deploy/poker/caddy/20-poker.conf',
  'deploy/timer/caddy/30-timer-spa.conf',
  'deploy/timer/caddy/40-timer-legacy-room.conf',
  'deploy/landing/caddy/90-landing.conf',
].map((rel) => path.join(REPO_ROOT, rel));

export const SITE_CONF_SOURCE = path.join(REPO_ROOT, 'deploy/caddy/tasuki.conf');

/** 断片の import が絶対パス固定なので、ここへ設置するしかない。 */
export const CADDY_ETC_DIR = '/etc/caddy/tasuki';
export const CADDY_APPS_DIR = '/etc/caddy/tasuki/apps';

export const TEST_RESULTS_DIR = path.join(REPO_ROOT, 'e2e/test-results');
export const LOG_DIR = path.join(TEST_RESULTS_DIR, 'logs');

/** Caddy の版は固定する。「最新」を取ると、ある日突然赤くなって原因が分からない。 */
export const CADDY_VERSION = '2.11.4';
export const CADDY_CACHE_DIR = path.join(
  process.env['HOME'] ?? '/tmp',
  '.cache/tasuki-e2e',
  `caddy-${CADDY_VERSION}`,
);

/** ハーネスが使うポート。断片が絶対値で宣言しているため sync 側は変えられない。 */
export const PORTS = { caddy: 18080, timerSync: 8787, pokerSync: 3311 } as const;
