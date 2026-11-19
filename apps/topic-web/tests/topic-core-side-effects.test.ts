/**
 * `@tasuki/topic-core` は副作用の無いモジュールだけでできている、と package.json で宣言する（`"sideEffects": false`）。
 *
 * 宣言が無いと、この画面がスキーマなどを topic-core の barrel（`src/index.ts`）から import しただけで、
 * 画面が使わない定型バンク（`topic-bank-*.ts`。10 言語の本文で約 0.8 MB）まで配布物に入る。
 * PR #643 のレビューで測った値: この画面の index の JS が、宣言なしで 1,074 kB（gzip 265 kB）、
 * 宣言ありで 267 kB（gzip 84 kB）。timer-web・landing・poker-web も同じく、お題の本文が消えた。
 *
 * **topic-core の src に副作用のあるモジュール（読み込むだけで何かを書き換える・登録する）を足すときは、
 * この宣言を見直す。** topic-core は Node の型を持たない（tsconfig）ので、この確かめは画面の側に置く。
 *
 * @requirements #634（PR #643 のレビュー）
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('@tasuki/topic-core の package.json', () => {
  it('副作用が無いと宣言している（画面の配布物に定型バンクを入れない）', () => {
    const pkg = JSON.parse(readFileSync(path.join(here, '../../../packages/topic-core/package.json'), 'utf8')) as { sideEffects?: unknown };
    expect(pkg.sideEffects).toBe(false);
  });
});
