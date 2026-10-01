/**
 * 対照実行（基準同士の比較）の Playwright 設定（#321・計画 Task 6）。`parity.config.ts` を土台に、
 * ブランチの側にも基準の dist を配る。状態の作り方と読み方の揺れだけを浮かび上がらせ、`noise.ts` の名指しを確かめる。
 *
 * **対照実行は、この設定を `-c` で明示したときだけ。** 環境変数では切り替えない（取り残すと通常の比較が基準同士の
 * 比較に化けて偽の緑になる・`context.ts`）。project の名前で、list の行頭に `[対照実行]` と出る。
 *
 * **このファイルの export は規約（名前付きエクスポート優先）の例外。** Playwright が default export を要求するため。
 */
import { defineConfig } from '@playwright/test';
import base from './parity.config';

export default defineConfig({
  ...base,
  metadata: { ...base.metadata, parityControl: true },
  // `timer.parity.ts` の `CONTROL_PROJECT` と同じ名前（食い違うとテストが止まる）
  projects: [{ name: '対照実行' }],
});
