/**
 * 開票演出の第 2 段の判定（#670）: 全員休憩・ほぼ同じ。
 *
 * - 全員休憩は 2 票以上で、全部が ☕
 * - ほぼ同じは数字の札だけ・3 票以上・札がちょうど 2 種類で片方がちょうど 1 枚
 * - 見学者は票を持たない（#419）。票の配列に居ない人は数えない
 *
 * @requirements #670
 */
import { describe, expect, it } from 'vitest';
import { BREAK_MIN_VOTES, NEAR_MIN_VOTES, judgeAllBreak, judgeNearAgreement } from '../src/agreement.js';
import type { Card } from '../src/deck.js';
import type { VoteView } from '../src/protocol.js';

const n = (value: 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21): Card => ({ kind: 'number', value });
const q: Card = { kind: 'question' };
const coffee: Card = { kind: 'coffee' };
const votes = (...cards: Card[]): VoteView[] => cards.map((card, i) => ({ participantId: `p${i}`, card }));

describe('閾値（#670）', () => {
  it('全員休憩は 2 票・ほぼ同じは 3 票', () => {
    expect(BREAK_MIN_VOTES).toBe(2);
    expect(NEAR_MIN_VOTES).toBe(3);
  });
});

describe('judgeAllBreak（#670）', () => {
  it('Given 2 人とも ☕ / Then 真', () => {
    expect(judgeAllBreak(votes(coffee, coffee))).toBe(true);
  });

  it('Given 4 人とも ☕ / Then 真', () => {
    expect(judgeAllBreak(votes(coffee, coffee, coffee, coffee))).toBe(true);
  });

  it('Given ☕ が 1 票だけ / Then 偽（下限 2 票）', () => {
    expect(judgeAllBreak(votes(coffee))).toBe(false);
  });

  it('Given 票が無い / Then 偽（見学者だけの部屋）', () => {
    expect(judgeAllBreak([])).toBe(false);
  });

  it('Given ☕ に数字が 1 枚混ざる / Then 偽', () => {
    expect(judgeAllBreak(votes(coffee, coffee, n(5)))).toBe(false);
  });

  it('Given ☕ に ? が 1 枚混ざる / Then 偽', () => {
    expect(judgeAllBreak(votes(coffee, coffee, q))).toBe(false);
  });

  it('Given 全員 ? / Then 偽（休憩ではない）', () => {
    expect(judgeAllBreak(votes(q, q))).toBe(false);
  });

  it('Given 全員が同じ数字 / Then 偽', () => {
    expect(judgeAllBreak(votes(n(5), n(5)))).toBe(false);
  });
});

describe('judgeNearAgreement（#670）', () => {
  it('Given 3 人のうち 2 人が 5・1 人が 8 / Then 真', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), n(8)))).toBe(true);
  });

  it('Given 並びが違っても（1 枚が先頭） / Then 真', () => {
    expect(judgeNearAgreement(votes(n(8), n(5), n(5)))).toBe(true);
  });

  it('Given 5 人のうち 4 人が同じ・1 人だけ違う / Then 真', () => {
    expect(judgeNearAgreement(votes(n(3), n(3), n(3), n(3), n(13)))).toBe(true);
  });

  it('Given 0 を含む（0 と 1 枚の 5） / Then 真（0 も数字の札）', () => {
    expect(judgeNearAgreement(votes(n(0), n(0), n(5)))).toBe(true);
  });

  it('Given 2 票だけ（5 と 8） / Then 偽（下限 3 票）', () => {
    expect(judgeNearAgreement(votes(n(5), n(8)))).toBe(false);
  });

  it('Given 1 票だけ / Then 偽', () => {
    expect(judgeNearAgreement(votes(n(5)))).toBe(false);
  });

  it('Given 票が無い / Then 偽', () => {
    expect(judgeNearAgreement([])).toBe(false);
  });

  it('Given 全員同じ / Then 偽（それは全員一致）', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), n(5)))).toBe(false);
  });

  it('Given 2 種類で両方 2 枚以上（2 対 2） / Then 偽', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), n(8), n(8)))).toBe(false);
  });

  it('Given 2 種類で 3 対 2 / Then 偽（片方が 1 枚ではない）', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), n(5), n(8), n(8)))).toBe(false);
  });

  it('Given 3 種類（2・1・1） / Then 偽', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), n(8), n(13)))).toBe(false);
  });

  it('Given 全員バラバラ / Then 偽', () => {
    expect(judgeNearAgreement(votes(n(3), n(5), n(8)))).toBe(false);
  });

  it('Given ? が 1 枚混ざる（5・5・?） / Then 偽', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), q))).toBe(false);
  });

  it('Given ☕ が 1 枚混ざる（5・5・☕） / Then 偽', () => {
    expect(judgeNearAgreement(votes(n(5), n(5), coffee))).toBe(false);
  });

  it('Given ☕ が 2 枚と数字 1 枚 / Then 偽', () => {
    expect(judgeNearAgreement(votes(coffee, coffee, n(5)))).toBe(false);
  });
});
