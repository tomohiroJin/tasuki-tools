/**
 * 除去検査（`removal.parity.ts`）の Playwright 設定（#321・設計正本 D2）。`parity.config.ts` を土台に、除去検査だけを流す。
 * 結果は `out/removal/<状態>.json`。読むのは `removal-summary.ts` の `loadRemovalProbe`。
 *
 * 実行: `cd e2e && TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=… pnpm exec playwright test -c parity/parity.removal.config.ts`
 *
 * **このファイルの export は規約（名前付きエクスポート優先）の例外。** Playwright が default export を要求するため。
 */
import { defineConfig } from '@playwright/test';
import base from './parity.config';

export default defineConfig({
  ...base,
  testMatch: '**/removal.parity.ts',
  testIgnore: [],
});
