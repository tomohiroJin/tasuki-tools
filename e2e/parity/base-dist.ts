/**
 * 基準の側のブラウザの文脈で、`/timer/` への要求を基準の dist から返す（#321・計画 P1）。
 *
 * **WS は経路の外**（`/ws?tool=timer` は `/timer/` を含まない。`routeWebSocket` は使わない ——
 * 掛けたページは同期を取りこぼす・`e2e/README.md`）。玄関（`/`）はハーネスが配るブランチのものを使う。
 *
 * dist に無いパスは `index.html` を返す（Caddy の SPA の断片と同じ振る舞い）。ただし**資産らしいパス
 * （拡張子を持つもの）が dist に無かったら数える** —— 基準とブランチで資産の名前がずれて、
 * 基準の側が HTML を資産として読んでいる状態を見逃さないため。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

/** 基準の commit（設計正本 §5.1。固定）。比較の仕組みの中で基準の SHA を書くのはここだけ。 */
export const BASE_SHA = 'ba9249d';

/**
 * 基準の dist の `index.html` が参照する資産（`BASE_SHA` を README の手順でビルドした実測）。
 * 資産の名前は中身のハッシュなので、別の commit や作り直したブランチの dist ならここが変わる。
 */
const BASE_ENTRY_ASSETS = ['assets/index-CEI3qZdH.js', 'assets/index-v3dAosde.css'] as const;

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

/** 解けるなら実体のパス（symlink を辿る）。無ければそのまま。 */
function realOrResolved(p: string): string {
  return existsSync(p) ? realpathSync(p) : path.resolve(p);
}

/** dist を含む git の作業ツリーの HEAD。git の外なら null。 */
function gitHeadOf(dir: string): string | null {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * 渡された dist が基準のものであることを断定する（ブランチの dist や別の commit の dist を基準と取り違えると、
 * 同じものどうしを比べて緑になる・偽の緑）。
 *
 * 1. ブランチの `apps/timer-web/dist` そのもの（symlink 越しを含む）ではない
 * 2. dist を含む作業ツリーの HEAD が {@link BASE_SHA} で始まる（git の外なら確かめられないので 3 だけに頼る）
 * 3. `index.html` が参照する資産の名前が {@link BASE_ENTRY_ASSETS} と一致する（作業ツリーの HEAD を動かした後に
 *    ビルドし直していない dist も、ここで止まる）
 */
function assertBaseDist(dir: string): void {
  const fail = (why: string): never => {
    throw new Error(`TASUKI_PARITY_BASE_DIST（${dir}）は基準（${BASE_SHA}）の dist ではない: ${why}（作り方は e2e/parity/README.md）`);
  };
  if (realOrResolved(dir) === realOrResolved(path.join(REPO_ROOT, 'apps/timer-web/dist'))) {
    fail('ブランチの apps/timer-web/dist を指している');
  }
  const head = gitHeadOf(dir);
  if (head !== null && !head.startsWith(BASE_SHA)) fail(`dist を含む作業ツリーの HEAD が ${head}`);
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="\/timer\/(assets\/index-[^"]+)"/g)].map((m) => m[1]).sort();
  if (JSON.stringify(assets) !== JSON.stringify([...BASE_ENTRY_ASSETS].sort())) {
    fail(`index.html が参照する資産が ${assets.join(', ') || '(なし)'}（基準は ${BASE_ENTRY_ASSETS.join(', ')}）`);
  }
}

/** 基準の timer の dist。無いか、基準のものでなければ、ここを読み込んだ時点で落とす。 */
export const BASE_DIST: string = (() => {
  const dir = process.env['TASUKI_PARITY_BASE_DIST'];
  if (dir === undefined || dir === '' || !existsSync(path.join(dir, 'index.html'))) {
    throw new Error(
      'TASUKI_PARITY_BASE_DIST に基準の timer の dist（index.html を含む）を渡してください。' +
        `（受け取った値: ${String(dir)}。作り方は e2e/parity/README.md）`,
    );
  }
  assertBaseDist(dir);
  return path.resolve(dir);
})();

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export interface BaseServing {
  /** 基準の dist から返した要求の件数。0 なら基準を撮っていない。 */
  readonly served: () => number;
  /** 拡張子を持つのに基準の dist に無かったパス。 */
  readonly missing: () => readonly string[];
}

export async function serveBaseDist(context: BrowserContext, distDir: string): Promise<BaseServing> {
  let served = 0;
  const missing: string[] = [];
  await context.route(
    (url) => url.pathname.startsWith('/timer/'),
    async (route) => {
      const url = new URL(route.request().url());
      let rel = '';
      let malformed = false;
      try {
        rel = decodeURIComponent(url.pathname.replace(/^\/timer\//, ''));
      } catch {
        malformed = true;
        missing.push(url.pathname);
      }
      const candidate = path.join(distDir, rel);
      const inside = candidate.startsWith(distDir + path.sep);
      const isFile = !malformed && inside && existsSync(candidate) && statSync(candidate).isFile();
      if (!malformed && !isFile && path.extname(rel) !== '') missing.push(url.pathname);
      const file = isFile ? candidate : path.join(distDir, 'index.html');
      served += 1;
      await route.fulfill({
        status: 200,
        contentType: TYPES[path.extname(file)] ?? 'application/octet-stream',
        body: readFileSync(file),
      });
    },
  );
  return { served: () => served, missing: () => [...missing] };
}
