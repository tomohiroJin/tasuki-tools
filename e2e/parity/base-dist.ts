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
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

/** 基準の timer の dist。無ければ、ここを読み込んだ時点で落とす。 */
export const BASE_DIST: string = (() => {
  const dir = process.env['TASUKI_PARITY_BASE_DIST'];
  if (dir === undefined || dir === '' || !existsSync(path.join(dir, 'index.html'))) {
    throw new Error(
      'TASUKI_PARITY_BASE_DIST に基準の timer の dist（index.html を含む）を渡してください。' +
        `（受け取った値: ${String(dir)}。作り方は e2e/parity/README.md）`,
    );
  }
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
