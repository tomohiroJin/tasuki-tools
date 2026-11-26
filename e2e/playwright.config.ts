/**
 * Playwright の設定。
 *
 * **このファイルの default export は規約（名前付きエクスポート優先）の例外。**
 * Playwright が default export を要求するため。
 */
import { defineConfig, devices, type Project } from '@playwright/test';
import { resolveBrowser } from './harness/browser';
import { TEST_RESULTS_DIR } from './harness/paths';
import { resolveTarget } from './harness/target';

const target = resolveTarget(process.env);
const browser = resolveBrowser(process.env);
const isProduction = target.kind === 'production';
const isCi = process.env['CI'] !== undefined;

const chromium: Project = { name: 'chromium', use: { ...devices['Desktop Chrome'] } };

/**
 * WebKit は iPhone の端末として、画面を開く主な流れだけを流す（#674・docs/adr/0031 の追記）。
 *
 * - **選び方はタグ。** 各道具の主な流れ（`@core`）と、iOS で崩れやすい所（`@webkit`。玄関・幅の狭い
 *   画面の配置とボタン・招待の手動コピー・poker の手で選ぶ欄）。名前の正規表現で選ぶと、改名で黙って外れる
 * - `@smoke`（HTTP の応答だけを見る）はブラウザに依らないので流さない
 * - **1 ワーカー。** WebKit の描画が重なると Check-in Cards とルーレットが時間切れになった（#674 の試走）
 */
const webkit: Project = {
  name: 'webkit-iphone',
  use: { ...devices['iPhone 15'] },
  grep: /@core|@webkit/,
  workers: 1,
};

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  globalSetup: './harness/global-setup.ts',
  outputDir: `${TEST_RESULTS_DIR}/artifacts`,
  fullyParallel: true,
  // **`.only` の置き忘れで検査対象が黙って縮むのを止める。**
  // 1 つでも `.only` があると Playwright はそれだけを走らせ、終了コード 0 で緑になる
  // （実測: 21 件が 1 件に縮んで「1 passed」）。ローカルでは絞り込みは道具として
  // 有用なので、CI でだけ禁じる。
  forbidOnly: isCi,
  // 本番は実サーバーの枠を無用に消費しないため逐次・再試行なし。
  // exactOptionalPropertyTypes下では workers に undefined を明示できないため、
  // ローカルはキー自体を渡さない（Playwright の既定値に委ねる）。
  ...(isProduction ? { workers: 1 } : {}),
  retries: isProduction ? 0 : isCi ? 1 : 0,
  timeout: isProduction ? 120_000 : 60_000,
  expect: { timeout: isProduction ? 10_000 : 5_000 },
  reporter: [['list'], ['html', { outputFolder: `${TEST_RESULTS_DIR}/html`, open: 'never' }]],
  use: {
    baseURL: target.baseURL,
    navigationTimeout: isProduction ? 30_000 : 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // 1 回の実行で流すのはどちらか一方（harness/browser.ts）
  projects: [browser === 'webkit' ? webkit : chromium],
});
