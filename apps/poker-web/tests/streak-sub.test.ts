/**
 * 連続の添え書き「N 回続けて」（#670）。開票の瞬間に一度だけ、見積もりの記録が「記録する」のときに、
 * 記録の末尾から数えた全員同じの連続で決める。
 *
 * @requirements #670
 */
import { describe, expect, it } from 'vitest';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { streakSubOf } from '../src/room-view';

type Estimate = NonNullable<RoomStateMessage['estimate']>;

const unanimousEntry = (value: 3 | 5) => ({ attempt: 1, at: 0, counts: [{ card: { kind: 'number' as const, value }, count: 3 }] });
const splitEntry = () => ({
  attempt: 1,
  at: 0,
  counts: [
    { card: { kind: 'number' as const, value: 3 as const }, count: 1 },
    { card: { kind: 'number' as const, value: 8 as const }, count: 2 },
  ],
});
const group = (id: number, entries: ReturnType<typeof unanimousEntry>[]) => ({ id, item: '', points: null, open: false, entries });

const streakOf = (n: number): Estimate => ({
  item: '',
  recording: true,
  log: [group(1, Array.from({ length: n }, () => unanimousEntry(5)))],
});

describe('streakSubOf（#670）', () => {
  it('Given 全員同じが 3 回続いた記録・記録する / Then 「3 回続けて」', () => {
    expect(streakSubOf('unanimous', streakOf(3))).toBe('3 回続けて');
  });

  it('Given 2 回続いた / Then 「2 回続けて」（N が 2 から）', () => {
    expect(streakSubOf('unanimous', streakOf(2))).toBe('2 回続けて');
  });

  it('Given 今回だけ（N=1） / Then 添え書きなし', () => {
    expect(streakSubOf('unanimous', streakOf(1))).toBeNull();
  });

  it('Given 記録しない / Then 続いていても出さない（画面ごとに数えるとずれる）', () => {
    expect(streakSubOf('unanimous', { ...streakOf(4), recording: false })).toBeNull();
  });

  it('Given 全員同じ以外の場面 / Then 連続は添えない', () => {
    for (const effect of ['break', 'split', 'near', 'scattered', 'complete'] as const) {
      expect(streakSubOf(effect, streakOf(4)), effect).toBeNull();
    }
    expect(streakSubOf(null, streakOf(4))).toBeNull();
  });

  it('Given 記録が無い（古いサーバー） / Then 添え書きなし', () => {
    expect(streakSubOf('unanimous', undefined)).toBeNull();
  });

  it('Given 末尾が割れた回で途切れた記録 / Then 数えない', () => {
    const estimate: Estimate = { item: '', recording: true, log: [group(1, [unanimousEntry(5), unanimousEntry(5), splitEntry() as never])] };
    expect(streakSubOf('unanimous', estimate)).toBeNull();
  });

  it('Given recording が省略（旧 wire は「記録する」と読む） / Then 数える', () => {
    const { recording: _omit, ...rest } = streakOf(2);
    expect(streakSubOf('unanimous', rest as Estimate)).toBe('2 回続けて');
  });
});
