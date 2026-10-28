/**
 * 5 枚の役の判定（#403・設計 §6）。
 *
 * @requirements #403 G-7
 */
import { describe, expect, it } from 'vitest';
import { HAND_CATEGORIES, evaluateHand } from '../src/hand-rank.js';
import type { PlayingCard, Suit } from '../src/playing-card.js';

/** `'AS KH 10D'` の形から札を作る（J=11 Q=12 K=13 A=14） */
function hand(text: string): PlayingCard[] {
  const ranks: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
  return text.split(' ').map((token) => {
    const suit = token.slice(-1) as Suit;
    const rank = token.slice(0, -1);
    return { suit, rank: ranks[rank] ?? Number(rank) } as PlayingCard;
  });
}

describe('evaluateHand（#403）', () => {
  it.each([
    ['AS KS QS JS 10S', 'royal-flush'],
    ['9H 8H 7H 6H 5H', 'straight-flush'],
    ['5D 4D 3D 2D AD', 'straight-flush'],
    ['7S 7H 7D 7C 2S', 'four-of-a-kind'],
    ['3S 3H 3D 9C 9S', 'full-house'],
    ['2C 7C 9C JC KC', 'flush'],
    ['10S 9H 8D 7C 6S', 'straight'],
    ['5S 4H 3D 2C AS', 'straight'],
    ['AS KH QD JC 10S', 'straight'],
    ['QS QH QD 4C 2S', 'three-of-a-kind'],
    ['JS JH 4D 4C 2S', 'two-pair'],
    ['8S 8H KD 4C 2S', 'one-pair'],
    ['AS JH 9D 4C 2S', 'high-card'],
  ] as const)('Given %s / When 判定する / Then %s', (cards, category) => {
    expect(evaluateHand(hand(cards)).category).toBe(category);
  });

  it('Given K-A-2-3-4（回り込み） / When 判定する / Then ストレートではない', () => {
    expect(evaluateHand(hand('KS AH 2D 3C 4S')).category).toBe('high-card');
  });

  it('Given 役の分類の並び / When 読む / Then 弱い順に 10 分類', () => {
    expect(HAND_CATEGORIES).toEqual([
      'high-card',
      'one-pair',
      'two-pair',
      'three-of-a-kind',
      'straight',
      'flush',
      'full-house',
      'four-of-a-kind',
      'straight-flush',
      'royal-flush',
    ]);
  });
});

describe('ストレートの高さ（#403）', () => {
  it('Given A-2-3-4-5 / When 判定する / Then 5 高（A は 1 として数える）', () => {
    expect(evaluateHand(hand('5S 4H 3D 2C AS')).ranks).toEqual([5]);
  });
});
