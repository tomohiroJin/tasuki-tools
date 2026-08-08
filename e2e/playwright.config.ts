/**
 * Playwright の設定。
 *
 * **このファイルの default export は規約（名前付きエクスポート優先）の例外。**
 * Playwright が default export を要求するため。
 */
import { defineConfig, devices } from '@playwright/test';
import { resolveTarget } from './harness/target';

const target = resolveTarget(process.env);
const isProduction = target.kind === 'production';
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  globalSetup: './harness/global-setup.ts',
  outputDir: './test-results/artifacts',
  fullyParallel: true,
  // 本番は実サーバーの枠を無用に消費しないため逐次・再試行なし。
  // exactOptionalPropertyTypes下では workers に undefined を明示できないため、
  // ローカルはキー自体を渡さない（Playwright の既定値に委ねる）。
  ...(isProduction ? { workers: 1 } : {}),
  retries: isProduction ? 0 : isCi ? 1 : 0,
  timeout: isProduction ? 120_000 : 60_000,
  expect: { timeout: isProduction ? 10_000 : 5_000 },
  reporter: [['list'], ['html', { outputFolder: './test-results/html', open: 'never' }]],
  use: {
    baseURL: target.baseURL,
    navigationTimeout: isProduction ? 30_000 : 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
