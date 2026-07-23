import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/stats';
import type { Card } from '../src/deck';

const n = (value: 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21): Card => ({ kind: 'number', value });
const q: Card = { kind: 'question' };
const coffee: Card = { kind: 'coffee' };

describe('computeStats: average（FR-010）', () => {
  it('数値票の算術平均を返す', () => {
    expect(computeStats([n(5), n(8)]).average).toBe(6.5);
  });

  it('? と ☕ は平均の計算から除外する', () => {
    expect(computeStats([n(5), q, coffee]).average).toBe(5);
  });

  it('全員が ? / ☕ の場合は average が null（算出不能）', () => {
    expect(computeStats([q, coffee, q]).average).toBeNull();
  });

  it('票が 0 件なら average は null', () => {
    expect(computeStats([]).average).toBeNull();
  });

  it('単独票はその値が平均になる', () => {
    expect(computeStats([n(13)]).average).toBe(13);
  });
});

describe('computeStats: modes（FR-010 / Edge Case: 同数最頻）', () => {
  it('最頻値を返す', () => {
    expect(computeStats([n(5), n(5), n(8)]).modes).toEqual([n(5)]);
  });

  it('同数の最頻値はすべて返す', () => {
    const { modes } = computeStats([n(5), n(5), n(8), n(8), n(13)]);
    expect(modes).toHaveLength(2);
    expect(modes).toEqual(expect.arrayContaining([n(5), n(8)]));
  });

  it('? や ☕ も票としては最頻値の対象になる', () => {
    expect(computeStats([q, q, n(5)]).modes).toEqual([q]);
  });

  it('票が 0 件なら modes は空配列', () => {
    expect(computeStats([]).modes).toEqual([]);
  });

  it('単独票はそれが最頻値', () => {
    expect(computeStats([coffee]).modes).toEqual([coffee]);
  });
});
