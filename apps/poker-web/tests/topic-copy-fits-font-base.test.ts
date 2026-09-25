/**
 * いまのお題の文言は書体の常用の層に収まる（`packages/ui/README.md`）。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
import { describe, expect, it } from 'vitest';
import { baseFaces, outsideBase } from './support/font-base';
import { TOPIC_BODY_TOGGLE, TOPIC_HEADING } from '../src/components/CurrentTopic';

describe('いまのお題の文言は書体の常用の層に収まる', () => {
  it('Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる', () => {
    // Given / When
    const faces = [...baseFaces().keys()].sort();
    // Then: 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect(faces).toEqual(['zkgn-400-base.woff2', 'zkgn-500-base.woff2', 'zkgn-700-base.woff2']);
  });

  it('Given お題の見出しと開閉ボタンの文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given / When
    const outside = outsideBase([TOPIC_HEADING, TOPIC_BODY_TOGGLE]);
    // Then
    expect(outside).toEqual([]);
  });
});
