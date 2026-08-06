/**
 * Playwright が要求する Chromium の revision と、導入済みのものが合っているかを検査する。
 *
 * revision は Playwright の版に 1 対 1 で紐づく（実測: 1.62.x → 1234 / 1.61.x → 1228）。
 * そのため package.json では版を完全固定している。ここはその固定が崩れていないか、
 * あるいは実行環境のブラウザが更新されていないかを起動前に捕まえる関門。
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

interface BrowsersJson {
  readonly browsers: readonly { readonly name: string; readonly revision: string }[];
}

/** playwright-core の browsers.json が宣言する chromium の revision。 */
export function requiredChromiumRevision(): string {
  const require = createRequire(import.meta.url);
  // browsers.json は package.json の exports に載っていないため、
  // package.json を解決してから隣を読む。
  const pkgPath = require.resolve('playwright-core/package.json');
  const raw: unknown = JSON.parse(readFileSync(path.join(path.dirname(pkgPath), 'browsers.json'), 'utf8'));
  const parsed = raw as BrowsersJson;
  const chromium = parsed.browsers.find((browser) => browser.name === 'chromium');
  if (chromium === undefined) {
    throw new Error('playwright-core の browsers.json に chromium の項目がありません。');
  }
  return chromium.revision;
}

/**
 * 要求 revision が導入済みかを検査する。
 *
 * `PLAYWRIGHT_BROWSERS_PATH` が指定されているとき（devcontainer）だけ検査する。
 * 未指定なら Playwright が自分の管理下（~/.cache）へ入れるので、こちらは口を出さない。
 */
export function assertChromiumInstalled(env: Record<string, string | undefined>): void {
  const browsersPath = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (browsersPath === undefined || browsersPath === '') return;

  const revision = requiredChromiumRevision();
  const expected = path.join(browsersPath, `chromium-${revision}`);
  if (existsSync(expected)) return;

  throw new Error(
    `Chromium revision ${revision} が ${browsersPath} に見つかりません（探した場所: ${expected}）。\n` +
      'playwright の版と実行環境のブラウザがずれています。package.json の @playwright/test の版を、' +
      '導入済みの revision に対応するものへ合わせてください。',
  );
}
