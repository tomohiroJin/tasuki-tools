import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { CARD_NAME_TIER_LIMITS, cardNameSize } from '../src/card-name-size';

/** 結果の札の名前の段（#373）。境目の両側を表で固定する。 */
describe('cardNameSize', () => {
  it.each([
    ['あや', 'lg'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.lg), 'lg'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.lg + 1), 'md'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.md), 'md'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.md + 1), 'sm'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.sm), 'sm'],
    ['あ'.repeat(CARD_NAME_TIER_LIMITS.sm + 1), 'xs'],
    ['あ'.repeat(MAX_DISPLAY_NAME), 'xs'],
  ] as const)('Given %#: %s / Then 段は %s', (name, size) => {
    expect(cardNameSize(name)).toBe(size);
  });

  it('Given サロゲートペアの名前 / Then UTF-16 の長さでなく字数で数える', () => {
    // 8 字（UTF-16 では 16）なので最大の段に残る
    expect(cardNameSize('😀'.repeat(CARD_NAME_TIER_LIMITS.lg))).toBe('lg');
  });

  it('Given 短い名前 / Then 7 字前後は今までの見た目（lg）のまま', () => {
    expect(cardNameSize('ゆうたろう')).toBe('lg');
    expect(cardNameSize('Alexander')).toBe('md');
  });
});
