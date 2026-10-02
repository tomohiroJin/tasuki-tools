/**
 * 基準（`ba9249d`）と並べる比較の Playwright 設定（#321・設計正本 §5）。
 *
 * **`pnpm e2e` には数えない**（`e2e/specs/` の外で、既定の設定は `./specs` しか見ない）。
 * 実行: `cd e2e && TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=… pnpm exec playwright test -c parity/parity.config.ts`
 *
 * ハーネス（Caddy・同期サーバー・`/var/www` の symlink）は既定の設定と同じ `globalSetup` で 1 本だけ立てる。
 * 基準の側は、ブラウザの文脈ごとに `/timer/` を基準の dist から返す（`base-dist.ts`・計画 P1）。
 *
 * **このファイルの export は規約（名前付きエクスポート優先）の例外。** Playwright が default export を要求するため。
 */
import { defineConfig, devices } from '@playwright/test';
import { resolveTarget } from '../harness/target';

const target = resolveTarget(process.env);
if (target.kind === 'production') {
  throw new Error('比較の仕組みは local でだけ動かす（TASUKI_E2E_TARGET=local）。');
}

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.parity.ts',
  // 除去検査は既定の比較に含めない。`parity.removal.config.ts` で流す
  testIgnore: '**/removal.parity.ts',
  globalSetup: '../harness/global-setup.ts',
  outputDir: './out/artifacts',
  snapshotPathTemplate: '{testDir}/out/snapshots/{arg}{ext}',
  // 両側を順に撮って比べる。並列にすると同期サーバーの負荷で状態の作り方が揺れる。
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // 残りわずか（最短 3 分の間隔）を待つ状態があるので長めに取る。
  timeout: 15 * 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: target.baseURL,
    trace: 'retain-on-failure',
  },
});
