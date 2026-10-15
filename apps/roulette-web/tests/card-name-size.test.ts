import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { CARD_NAME_TIER_LIMITS, cardNameSize, displayWidthOf } from '../src/card-name-size';

/** 結果の札の名前の段（#373）。境目の両側を表で固定する。長さは表示幅（全角 1・半角 0.6）。 */
describe('cardNameSize', () => {
  it.each([
    ['あや', 'lg'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.lg), 'lg'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.lg + 1), 'md'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.md), 'md'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.md + 1), 'sm'],
    ['あ'.repeat(MAX_DISPLAY_NAME), 'sm'],
  ] as const)('Given 全角 %#: %s / Then 段は %s', (name, size) => {
    expect(cardNameSize(name)).toBe(size);
  });

  it('Given 9 字の英字名 / Then 全角の同じ字数と違い、最大の段のまま', () => {
    expect(cardNameSize('Alexander')).toBe('lg');
    expect(cardNameSize('あ'.repeat(9))).toBe('md');
    // 表示幅 6 を超える英字は次の段（10 字 = 6.0 は最大の段、11 字 = 6.6 は md）
    expect(cardNameSize('a'.repeat(10))).toBe('lg');
    expect(cardNameSize('a'.repeat(11))).toBe('md');
  });

  it('Given 英字 33 字（表示幅 19.8） / Then 全角の同じ字数（sm）より大きい段に収まる', () => {
    expect(cardNameSize('a'.repeat(33))).toBe('md');
    expect(cardNameSize('あ'.repeat(33))).toBe('sm');
  });

  it('Given サロゲートペアの名前 / Then UTF-16 の長さでなくコードポイントで数える', () => {
    expect(displayWidthOf('😀😀')).toBe(2);
    expect(cardNameSize('😀'.repeat(CARD_NAME_TIER_LIMITS.lg))).toBe('lg');
  });

  it('Given 半角カナ / Then 円盤の席と同じく半角として数える', () => {
    expect(displayWidthOf('ﾔﾏﾀﾞ')).toBeCloseTo(2.4);
  });
});
