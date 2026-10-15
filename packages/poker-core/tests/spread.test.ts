/**
 * 見積もりの割れ（#405）。
 *
 * 数値の札の最大と最小が、デッキの並び（0 1 2 3 5 8 13 21）で 2 段以上離れていたら割れたとみなす。
 *
 * @requirements #405 FR-010a
 */
import { describe, expect, it } from 'vitest';
import { SPREAD_MIN_STEPS, findSpread } from '../src/spread.js';
import type { Card } from '../src/deck.js';
import type { VoteView } from '../src/protocol.js';

const n = (value: 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21): Card => ({ kind: 'number', value });
const q: Card = { kind: 'question' };
const coffee: Card = { kind: 'coffee' };
const vote = (participantId: string, card: Card): VoteView => ({ participantId, card });

describe('findSpread（#405）', () => {
  it('閾値は 2 段', () => {
    expect(SPREAD_MIN_STEPS).toBe(2);
  });

  it('Given 隣同士の札（5 と 8） / When 判定する / Then 割れていない', () => {
    expect(findSpread([vote('a', n(5)), vote('b', n(8))])).toBeNull();
  });

  it('Given 2 段離れた札（3 と 8） / When 判定する / Then 最大と最小の札と出した人を返す', () => {
    expect(findSpread([vote('a', n(3)), vote('b', n(5)), vote('c', n(8))])).toEqual({
      high: { card: n(8), participantIds: ['c'] },
      low: { card: n(3), participantIds: ['a'] },
    });
  });

  it('Given 0 と 2（値の差は 2 だが 2 段） / When 判定する / Then 割れている', () => {
    expect(findSpread([vote('a', n(0)), vote('b', n(2))])).not.toBeNull();
  });

  it('Given 13 と 21（値の差は 8 だが隣同士） / When 判定する / Then 割れていない', () => {
    expect(findSpread([vote('a', n(13)), vote('b', n(21))])).toBeNull();
  });

  it('Given 全員が同じ札 / When 判定する / Then 割れていない', () => {
    expect(findSpread([vote('a', n(5)), vote('b', n(5))])).toBeNull();
  });

  it('Given ? と ☕ だけ / When 判定する / Then 割れていない', () => {
    expect(findSpread([vote('a', q), vote('b', coffee)])).toBeNull();
  });

  it('Given 数値の票が 1 票と ? / When 判定する / Then 割れていない', () => {
    expect(findSpread([vote('a', n(1)), vote('b', q)])).toBeNull();
  });

  it('Given 票が 0 件 / When 判定する / Then 割れていない', () => {
    expect(findSpread([])).toBeNull();
  });

  it('Given ? と ☕ が混ざる / When 判定する / Then 数値の札だけで最大と最小を決める', () => {
    expect(findSpread([vote('a', q), vote('b', n(1)), vote('c', coffee), vote('d', n(13))])).toEqual({
      high: { card: n(13), participantIds: ['d'] },
      low: { card: n(1), participantIds: ['b'] },
    });
  });

  it('Given 最大と最小をそれぞれ複数人が出した / When 判定する / Then 全員を票の順で返す', () => {
    const result = findSpread([
      vote('a', n(8)),
      vote('b', n(2)),
      vote('c', n(3)),
      vote('d', n(8)),
      vote('e', n(2)),
    ]);
    expect(result).toEqual({
      high: { card: n(8), participantIds: ['a', 'd'] },
      low: { card: n(2), participantIds: ['b', 'e'] },
    });
  });
});
