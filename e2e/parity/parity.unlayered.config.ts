/**
 * 囲いを外した一時ビルドで比べる設定（#321・設計正本 D3・計画 P3）。ブランチの timer を `layer(timer)` 無しでビルドして配る。
 * **環境変数ではなく設定ファイルで選ぶ**（対照実行と同じ流儀）。`globalSetup` のビルドより前に変数を立てる。
 * 差のうち「親を先に移したとき、レイヤー外になった親の `:where(.x > :not(:last-child))` が、まだ Tailwind のままの子の
 * margin に勝つ」型は既知の偽陽性（設計正本 D3）。ほかの差は直す。
 *
 * 変数は `globalSetup`（`harness/build.ts` の `buildWebApps`）が turbo へ、turbo が `turbo.json` の
 * `@tasuki/timer-web#build` の `env` 宣言でビルドへ渡す（`execFileSync` は `env` を指定せず `process.env` を継承する）。
 * 切り替えの本体は `apps/timer-web/vite-timer-css.ts`。`layer(timer)` の `@import` が 0 本ならビルドが止まる。
 *
 * **このファイルの export は規約（名前付きエクスポート優先）の例外。** Playwright が default export を要求するため。
 */
import { defineConfig } from '@playwright/test';
import base from './parity.config';

process.env['TASUKI_TIMER_UNLAYERED'] = '1';

export default defineConfig({
  ...base,
  metadata: { ...base.metadata, parityUnlayered: true },
  // `parityControl` は立てない（`timer.parity.ts` の `isControlRun` は project の名前「対照実行」と突き合わせる）。
  // `use` は最上位（`...base`）を project が引き継ぐので書かない（対照実行の設定と同じ形）
  projects: [{ name: '囲いを外した一時ビルド' }],
});
