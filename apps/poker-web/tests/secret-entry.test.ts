/**
 * 隠しの入口の検出（#403・設計 §5.1）。
 *
 * @requirements #403 T-1
 */
import { describe, expect, it } from 'vitest';
import { KONAMI_CODE, TAP_COUNT, TAP_WINDOW_MS, advanceSequence, advanceTaps } from '../src/secret-entry';

/** 並びを最初から打ち、最後の進み具合を返す */
function type(keys: readonly string[]): number {
  return keys.reduce((progress, key) => advanceSequence(progress, key), 0);
}

describe('コナミコマンド（#403 §5.1）', () => {
  it('並びは ↑↑↓↓←→←→BA', () => {
    expect(KONAMI_CODE).toEqual(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']);
  });

  it('Given 正しい並び / When 打つ / Then 最後まで進む', () => {
    expect(type(KONAMI_CODE)).toBe(KONAMI_CODE.length);
  });

  it('Given 大文字の B A / When 打つ / Then 同じく最後まで進む（Shift・CapsLock でも開ける）', () => {
    expect(type([...KONAMI_CODE.slice(0, 8), 'B', 'A'])).toBe(KONAMI_CODE.length);
  });

  it('Given 途中で違うキー / When 打つ / Then 最初からやり直し', () => {
    expect(type(['ArrowUp', 'ArrowUp', 'x'])).toBe(0);
  });

  it('Given ↑ を 3 回打ってから続きを打つ / When 打つ / Then 最後まで進む（余分な ↑ で取りこぼさない）', () => {
    expect(type(['ArrowUp', ...KONAMI_CODE])).toBe(KONAMI_CODE.length);
  });
});

describe('見出しを続けて押す（#403 §5.1）', () => {
  /** 指定した時刻に押した列を進め、最後の列を返す */
  const tap = (times: readonly number[]) => times.reduce<number[]>((acc, now) => advanceTaps(acc, now), []);

  it(`${TAP_COUNT} 回・${TAP_WINDOW_MS}ms`, () => {
    expect([TAP_COUNT, TAP_WINDOW_MS]).toEqual([5, 2000]);
  });

  it('Given 2 秒以内に 5 回 / When 押す / Then 5 回に達する', () => {
    expect(tap([0, 300, 600, 900, 1999])).toHaveLength(5);
  });

  it('Given 間が空いた / When 押す / Then 古い押下は数えない', () => {
    expect(tap([0, 300, 600, 900, 2000])).toHaveLength(4);
    expect(tap([0, 3000, 3100])).toHaveLength(2);
  });
});
