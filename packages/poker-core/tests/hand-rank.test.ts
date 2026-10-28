/**
 * 5 枚の役の判定（#403・設計 §6）。
 *
 * @requirements #403 T-5
 */
import { describe, expect, it } from 'vitest';
import { HAND_CATEGORIES, compareHands, evaluateHand } from '../src/hand-rank.js';
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

describe('compareHands（#403）', () => {
  const cmp = (a: string, b: string) => Math.sign(compareHands(evaluateHand(hand(a)), evaluateHand(hand(b))));

  it('Given 役が違う / When 比べる / Then 役の強い方が勝つ', () => {
    expect(cmp('2S 2H 3D 4C 5S', 'AS KH QD JC 9S')).toBe(1);
    expect(cmp('2C 7C 9C JC KC', '10S 9H 8D 7C 6S')).toBe(1);
  });

  it('Given 同じワンペア / When 比べる / Then ペアの数字、次に残りの高い順で決める', () => {
    expect(cmp('9S 9H 2D 3C 4S', '8S 8H AD KC QS')).toBe(1);
    expect(cmp('9S 9H AD 3C 4S', '9D 9C KD QC JS')).toBe(1);
    expect(cmp('9S 9H AD KC 3S', '9D 9C AH KD 2S')).toBe(1);
  });

  it('Given 同じツーペア / When 比べる / Then 上のペア → 下のペア → 残り', () => {
    expect(cmp('JS JH 3D 3C 2S', '10S 10H 9D 9C AS')).toBe(1);
    expect(cmp('JS JH 4D 4C 2S', 'JD JC 3D 3C AS')).toBe(1);
    expect(cmp('JS JH 4D 4C 5S', 'JD JC 4H 4S 2S')).toBe(1);
  });

  it('Given フルハウス同士 / When 比べる / Then 3 枚の側の数字で決める', () => {
    expect(cmp('4S 4H 4D 2C 2S', '3S 3H 3D AC AS')).toBe(1);
  });

  it('Given 5 高のストレートと 6 高のストレート / When 比べる / Then 6 高が勝つ（A は 1 として数える）', () => {
    expect(cmp('6S 5H 4D 3C 2S', '5S 4H 3D 2C AS')).toBe(1);
  });

  it('Given スートだけが違う同じ手 / When 比べる / Then 引き分け', () => {
    expect(cmp('AS JH 9D 4C 2S', 'AH JD 9C 4S 2H')).toBe(0);
  });

  it('Given 逆の順 / When 比べる / Then 符号が反転する', () => {
    expect(cmp('8S 8H KD 4C 2S', 'QS QH QD 4C 2S')).toBe(-1);
  });
});
