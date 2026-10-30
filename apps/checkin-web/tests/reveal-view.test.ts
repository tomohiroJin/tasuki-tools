/**
 * 開いた後の見え方の純粋関数（#406 3.4・設計 §5）。
 */
import type { PileView } from '@tasuki/checkin-core';
import { describe, expect, it } from 'vitest';
import { REVEAL_FADE_MS, REVEAL_FLIP_MS, REVEAL_STAGGER_MS, REVEAL_TOTAL_MAX_MS, revealSchedule, summaryLine, topCards } from '../src/reveal-view';

const weather = (sunny: number, cloudy: number, rain: number, thunder: number): PileView[] => [
  { card: 'sunny', count: sunny },
  { card: 'cloudy', count: cloudy },
  { card: 'rain', count: rain },
  { card: 'thunder', count: thunder },
];

describe('topCards（一番多い山）', () => {
  it('Given 最多が 1 つ / Then その札だけ', () => {
    expect([...topCards(weather(3, 1, 0, 1))]).toEqual(['sunny']);
  });

  it('Given 最多が同数で 2 つ / Then 2 つとも（m516）', () => {
    expect([...topCards(weather(2, 2, 1, 0))].sort()).toEqual(['cloudy', 'sunny']);
  });

  it('Given 全部 0 / Then 空', () => {
    expect(topCards(weather(0, 0, 0, 0)).size).toBe(0);
  });

  it('Given 山が無い / Then 空', () => {
    expect(topCards([]).size).toBe(0);
  });
});

describe('summaryLine（要約の 1 行）', () => {
  it('Given 最多が 1 つ / Then 「晴れが 3 人」', () => {
    expect(summaryLine('weather', weather(3, 1, 0, 1))).toBe('晴れが 3 人');
  });

  it('Given 同数の最多 / Then 「・」で並べて「ずつ」', () => {
    expect(summaryLine('weather', weather(2, 2, 1, 0))).toBe('晴れ・くもりが 2 人ずつ');
  });

  it('Given 0 枚 / Then 出した人はいません', () => {
    expect(summaryLine('weather', weather(0, 0, 0, 0))).toBe('出した人はいません');
  });

  it('Given 数のやり方で同数の最多 / Then 「4・5」と並べる', () => {
    const piles: PileView[] = ['1', '2', '3', '4', '5'].map((card) => ({ card, count: card === '4' || card === '5' ? 2 : 0 }));
    expect(summaryLine('roti', piles)).toBe('いちばん多いのは 4・5');
  });

  it('Given 数のやり方 / Then 人数と紛れない言い方', () => {
    const piles: PileView[] = ['1', '2', '3', '4', '5'].map((card) => ({ card, count: card === '4' ? 4 : 1 }));
    expect(summaryLine('roti', piles)).toBe('いちばん多いのは 4');
  });

  it.each(['expectation', 'understanding'] as const)(
    'Given #465 で足した数のやり方 %s / Then 人数と紛れない言い方',
    (method) => {
      const piles: PileView[] = ['1', '2', '3', '4', '5'].map((card) => ({ card, count: card === '4' ? 3 : 0 }));
      expect(summaryLine(method, piles)).toBe('いちばん多いのは 4');
    },
  );
});

describe('revealSchedule（開く動きの遅れ）', () => {
  it('Given 4 枚 / Then 90ms 間隔で、全体は 2 秒以内', () => {
    const s = revealSchedule(4, false);
    expect(REVEAL_STAGGER_MS).toBe(90);
    expect(s.delaysMs).toEqual([0, 90, 180, 270]);
    expect(s.totalMs).toBeLessThanOrEqual(REVEAL_TOTAL_MAX_MS);
  });

  it('Given 30 枚 / Then 間隔を縮め、最後の遅れ＋裏返し＋出る時間が 2 秒以内（E12 の上限）', () => {
    const s = revealSchedule(30, false);
    expect(s.delaysMs).toHaveLength(30);
    expect(s.delaysMs[1]! - s.delaysMs[0]!).toBeLessThan(REVEAL_STAGGER_MS);
    expect(s.delaysMs.at(-1)! + REVEAL_FLIP_MS + REVEAL_FADE_MS).toBe(s.totalMs);
    expect(s.totalMs).toBeLessThanOrEqual(REVEAL_TOTAL_MAX_MS);
    expect(s.delaysMs).toEqual([...s.delaysMs].sort((a, b) => a - b));
  });

  it('Given 10 枚 / Then 最後の遅れ＋裏返し＋出る時間が totalMs で 2 秒以内', () => {
    const s = revealSchedule(10, false);
    expect(s.delaysMs.at(-1)! + REVEAL_FLIP_MS + REVEAL_FADE_MS).toBe(s.totalMs);
    expect(s.totalMs).toBeLessThanOrEqual(REVEAL_TOTAL_MAX_MS);
  });

  it('Given 1 枚 / Then 遅れは [0]', () => {
    expect(revealSchedule(1, false).delaysMs).toEqual([0]);
  });

  it('Given 動きを減らす設定 / Then 遅れは全部 0 で全体も 0（E12・m514）', () => {
    for (const n of [0, 1, 4, 30]) {
      const s = revealSchedule(n, true);
      expect(s.delaysMs).toHaveLength(n);
      expect(s.delaysMs.every((d) => d === 0)).toBe(true);
      expect(s.totalMs).toBe(0);
    }
  });

  it('Given 札が 0 枚 / Then 空', () => {
    expect(revealSchedule(0, false)).toEqual({ delaysMs: [], totalMs: 0 });
  });
});
