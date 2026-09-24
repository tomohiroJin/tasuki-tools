/**
 * UI の文言は書体の常用の層（base）に収める（`packages/ui/README.md`）。
 *
 * 計画を書く段の実測で、spec の「掲げる」「本文」、PR 1 の topic-core の文言 3 件が外れていた
 * （計画「実測で spec から外したこと」）。
 *
 * **ここが見るのは `src/copy.ts` と topic-core の文言表だけである。** 画面（`.tsx`）に直書きした
 * 文言は、Task 5 の `tests/rendered-text-fits-font-base.test.tsx`（描いた画面の文字を当てる）が拾う。
 */
import { describe, expect, it } from 'vitest';
import { TOPIC_ERROR_CODES, topicErrorMessageFor } from '@tasuki/topic-core';
import * as copy from '../src/copy';
import { baseFaces, outsideBase } from './support/font-base';

/** 文言の一覧。`copy.ts` の文字列と、文字列の表（難易度の名前など）の値を平たくする。 */
function allTexts(): string[] {
  const fromCopy = Object.values(copy).flatMap((value) =>
    typeof value === 'string' ? [value] : Object.values(value as Record<string, string>),
  );
  return [...fromCopy, ...TOPIC_ERROR_CODES.map(topicErrorMessageFor)];
}

/**
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe('UI の文言は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    // Given / When
    const faces = [...baseFaces().keys()].sort();
    // Then: 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect(faces).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given お題ツールの文言とお題のエラーの文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given
    const texts = allTexts();
    // When
    const failures = outsideBase(texts);
    // Then（件数も固定する。`copy.ts` の import が空振りしても緑にしない）
    expect(failures).toEqual([]);
    expect(texts.length).toBeGreaterThan(30);
  });
});
