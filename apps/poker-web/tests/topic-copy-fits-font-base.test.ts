/**
 * いまのお題の文言は書体の常用の層に収まる（`packages/ui/README.md`）。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
import { describe, expect, it } from 'vitest';
import { outsideBase } from './support/font-base';
import { TOPIC_BODY_TOGGLE, TOPIC_HEADING } from '../src/components/CurrentTopic';

describe('いまのお題の文言は書体の常用の層に収まる', () => {
  it('Given お題の見出しと開閉ボタンの文言 / When 常用の層の範囲に当てる / Then 外れる字は無い', () => {
    // Given / When
    const outside = outsideBase([TOPIC_HEADING, TOPIC_BODY_TOGGLE]);
    // Then
    expect(outside).toEqual([]);
  });
});
