/**
 * コードの分からないエラーに出す既定の文言（#378）。
 *
 * timer・poker・topic・roulette の 4 つで同じ文にそろえてある。core と web アプリの
 * 写しは 1 つの定数を共有できない（`docs/adr/0017`）ので、それぞれのテストが同じ文を固定する。
 * core の 2 つは `apps/tasuki-sync/test/default-error-text.test.ts` が見る。
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_ERROR_TEXT } from '../src/copy';

describe('既定のエラーの文言（#378）', () => {
  it('Given 既定の文言 / When 見る / Then ほかのツールと同じ句点なしの文', () => {
    expect(DEFAULT_ERROR_TEXT).toBe('操作を完了できませんでした');
  });
});
