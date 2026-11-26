/**
 * 「全員同じ」が続けて何回か（#670）。記録の末尾から数える。
 *
 * @requirements #670
 */
import { describe, expect, it } from 'vitest';
import type { Card } from '../src/deck.js';
import { EMPTY_ESTIMATE_LOG, closeOpenGroup, recordReveal, unanimousStreak, type EstimateLog } from '../src/estimate-log.js';

const n = (value: 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21): Card => ({ kind: 'number', value });
const coffee: Card = { kind: 'coffee' };
const q: Card = { kind: 'question' };

/** 開票を順に足す。閉じる印（'close'）が来たら束を閉じる */
function build(steps: ReadonlyArray<readonly Card[] | 'close'>): EstimateLog {
  let log = EMPTY_ESTIMATE_LOG;
  let at = 0;
  for (const step of steps) {
    if (step === 'close') log = closeOpenGroup(log, null);
    else log = recordReveal(log, 'item', step, (at += 1));
  }
  return log;
}

describe('unanimousStreak（#670）', () => {
  it('Given 記録が空 / Then 0', () => {
    expect(unanimousStreak([])).toBe(0);
  });

  it('Given 末尾が全員同じ 1 回 / Then 1', () => {
    expect(unanimousStreak(build([[n(5), n(5)]]).groups)).toBe(1);
  });

  it('Given 3 回続けて全員同じ / Then 3', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [n(8), n(8), n(8)], [n(3), n(3)]]).groups)).toBe(3);
  });

  it('Given 末尾が全員同じでない / Then 0', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [n(5), n(8)]]).groups)).toBe(0);
  });

  it('Given 途中で途切れる（同じ・割れ・同じ・同じ） / Then 末尾の 2', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [n(3), n(8)], [n(5), n(5)], [n(2), n(2)]]).groups)).toBe(2);
  });

  it('Given 束をまたいで続く / Then 束の数でなく開票の数で数える', () => {
    const log = build([[n(5), n(5)], [n(5), n(5)], 'close', [n(8), n(8)], 'close', [n(3), n(3)]]);
    expect(log.groups).toHaveLength(3);
    expect(unanimousStreak(log.groups)).toBe(4);
  });

  it('Given 束の境目で途切れる / Then 境目より後だけ', () => {
    const log = build([[n(5), n(8)], 'close', [n(3), n(3)], [n(2), n(2)]]);
    expect(unanimousStreak(log.groups)).toBe(2);
  });

  it('Given 1 枚だけの行が末尾 / Then 数えない（0）', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [n(5)]]).groups)).toBe(0);
  });

  it('Given 1 枚だけの行が間に挟まる / Then そこで途切れる', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [n(5)], [n(3), n(3)]]).groups)).toBe(1);
  });

  it('Given ☕ だけの行が末尾 / Then 数えない（0）', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [coffee, coffee]]).groups)).toBe(0);
  });

  it('Given ? だけの行が末尾 / Then 数えない（0）', () => {
    expect(unanimousStreak(build([[n(5), n(5)], [q, q]]).groups)).toBe(0);
  });

  it('Given 2 人だけの全員同じ（下限ちょうど） / Then 1', () => {
    expect(unanimousStreak(build([[n(0), n(0)]]).groups)).toBe(1);
  });
});
