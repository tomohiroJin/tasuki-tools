/**
 * 規則の使用状況（E8）を取る設定（#321・計画 P4）。ブランチの timer を CSS の最小化と Tailwind の最適化を止めてビルドして配る。
 * ソースの規則とビルドの規則を鍵で突き合わせるため（E8 の書き出しは Task 3 で足す）。
 * **環境変数ではなく設定ファイルで選ぶ**（対照実行と同じ流儀）。`globalSetup` のビルドより前に変数を立てる。
 *
 * 変数は `globalSetup`（`harness/build.ts` の `buildWebApps`）が turbo へ、turbo が `turbo.json` の
 * `@tasuki/timer-web#build` の `env` 宣言でビルドへ渡す（`execFileSync` は `env` を指定せず `process.env` を継承する）。
 * 切り替えの本体は `apps/timer-web/vite-timer-css.ts`（`vite.config.ts` の `build.cssMinify` と `postcss.config.js` の `optimize`）。
 *
 * **このファイルの export は規約（名前付きエクスポート優先）の例外。** Playwright が default export を要求するため。
 */
import { defineConfig } from '@playwright/test';
import { setParityBuildSwitch } from '../harness/parity-build-switches';
import base from './parity.config';

// 自分で立てたことを控えに残す（Playwright の worker が設定を読み直したとき、基底の取り残しの断定に止められない）
setParityBuildSwitch(process.env, 'TASUKI_TIMER_CSS_UNMINIFIED');

export default defineConfig({
  ...base,
  metadata: { ...base.metadata, parityUsage: true },
  // `parityControl` は立てない（`timer.parity.ts` の `isControlRun` は project の名前「対照実行」と突き合わせる）。
  // `use` は最上位（`...base`）を project が引き継ぐので書かない（対照実行の設定と同じ形）
  projects: [{ name: '規則の使用状況' }],
});
