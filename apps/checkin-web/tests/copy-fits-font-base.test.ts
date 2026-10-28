/**
 * UI の文言は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 *
 * **ここが見るのは `src/copy.ts` と checkin-core の文言表だけである。** 画面（`.tsx`）に直書きした
 * 文言は、`tests/rendered-text-fits-font-base.test.tsx`（描いた画面の文字を当てる）が拾う。
 */
import { describe, expect, it } from 'vitest';
import { CHECKIN_ERROR_CODES, checkinErrorMessageFor } from '@tasuki/checkin-core';
import * as copy from '../src/copy';
import { baseFaces, outsideBase } from './support/font-base';

/**
 * 文言の一覧。`copy.ts` の文字列と、名前などを差し込む関数（**ASCII の仮の値で呼んだ結果**。
 * 利用者の入力は判定の外）を平たくする。
 */
function allTexts(): string[] {
  const fromCopy = Object.values(copy).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') return [(value as (...args: unknown[]) => string)('Ab', 2, 3)];
    return [];
  });
  return [...fromCopy, ...CHECKIN_ERROR_CODES.map(checkinErrorMessageFor)];
}

/**
 * @requirements #406 E13（UI 文言は書体の base 層に収める）
 */
describe('UI の文言は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    // Given / When
    const faces = [...baseFaces().keys()].sort();
    // Then: 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect(faces).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given Check-in Cards の文言とエラーの文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given
    const texts = allTexts();
    // When
    const failures = outsideBase(texts);
    // Then（件数も固定する。`copy.ts` の import が空振りしても緑にしない）
    expect(failures).toEqual([]);
    expect(texts.length).toBeGreaterThan(20);
  });

  it('対照: 検査は base 層に無い字を拾う（拾えない検査は常に緑になる）', () => {
    expect(outsideBase(['議論'])).not.toEqual([]);
  });
});
