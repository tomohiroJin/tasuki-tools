import { describe, expect, it } from 'vitest';
import type { Card } from '../src/deck.js';
import {
  closeOpenGroup,
  countCards,
  EMPTY_ESTIMATE_LOG,
  MAX_ESTIMATE_ENTRIES,
  recordReveal,
  setGroupPoints,
  type EstimateLog,
} from '../src/estimate-log.js';

const num = (value: 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21): Card => ({ kind: 'number', value });
const question: Card = { kind: 'question' };
const coffee: Card = { kind: 'coffee' };

/** 行の総数 */
function totalEntries(log: EstimateLog): number {
  return log.groups.reduce((sum, g) => sum + g.entries.length, 0);
}

describe('recordReveal', () => {
  it('Given 空の記録 / When 開票を足す / Then 束が 1 つ（id 1・open・points null）で行が 1 つ', () => {
    // When
    const log = recordReveal(EMPTY_ESTIMATE_LOG, 'PROJ-1', [num(5)], 1000);
    // Then
    expect(log.nextId).toBe(2);
    expect(log.groups).toHaveLength(1);
    const group = log.groups[0]!;
    expect(group.id).toBe(1);
    expect(group.open).toBe(true);
    expect(group.points).toBeNull();
    expect(group.entries).toEqual([
      { attempt: 1, at: 1000, item: 'PROJ-1', counts: [{ card: num(5), count: 1 }] },
    ]);
  });

  it('Given open の束 / When 開票を足す / Then 同じ束に attempt 2 が足される。nextId は 2 のまま', () => {
    // Given
    const first = recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000);
    // When
    const log = recordReveal(first, 'A', [num(8)], 2000);
    // Then
    expect(log.groups).toHaveLength(1);
    expect(log.groups[0]!.entries.map((e) => e.attempt)).toEqual([1, 2]);
    expect(log.nextId).toBe(2);
  });

  it('Given 再投票の間の改名 / When item A と B で開票 / Then 束は 1 つで行の item は A, B', () => {
    // When
    const a = recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000);
    const log = recordReveal(a, 'B', [num(5)], 2000);
    // Then
    expect(log.groups).toHaveLength(1);
    expect(log.groups[0]!.entries.map((e) => e.item)).toEqual(['A', 'B']);
  });

  it('Given 閉じた束 / When 開票を足す / Then id 2 の新しい束が open で足され、前の束は open: false のまま', () => {
    // Given
    const closed = closeOpenGroup(recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000), 5);
    // When
    const log = recordReveal(closed, 'B', [num(3)], 2000);
    // Then
    expect(log.groups).toHaveLength(2);
    expect(log.groups[0]!.open).toBe(false);
    expect(log.groups[1]!.id).toBe(2);
    expect(log.groups[1]!.open).toBe(true);
    expect(log.groups[1]!.entries[0]!.attempt).toBe(1);
  });

  it('Given 入力の記録 / When 開票を足す / Then 入力は書き換わらない', () => {
    // Given
    const before = recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000);
    const snapshot = JSON.parse(JSON.stringify(before)) as typeof before;
    // When
    recordReveal(before, 'A', [num(8)], 2000);
    // Then
    expect(before).toEqual(snapshot);
    expect(EMPTY_ESTIMATE_LOG).toEqual({ nextId: 1, groups: [] });
  });

  it('Given 行 / When キーを見る / Then 参加者を持たず attempt・at・item・counts だけ', () => {
    // When
    const log = recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5), num(8)], 1000);
    // Then
    expect(Object.keys(log.groups[0]!.entries[0]!).sort()).toEqual(['at', 'attempt', 'counts', 'item']);
  });
});

describe('closeOpenGroup', () => {
  it('Given open の束 / When 5 で閉じる / Then 末尾の束が open: false・points 5', () => {
    // Given
    const log = recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000);
    // When
    const closed = closeOpenGroup(log, 5);
    // Then
    expect(closed.groups[0]!.open).toBe(false);
    expect(closed.groups[0]!.points).toBe(5);
  });

  it('Given open の束が無い / When 閉じる / Then log をそのまま返す', () => {
    // Given
    const closed = closeOpenGroup(recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000), 5);
    // Then
    expect(closeOpenGroup(closed, 8)).toBe(closed);
    expect(closeOpenGroup(EMPTY_ESTIMATE_LOG, 8)).toBe(EMPTY_ESTIMATE_LOG);
  });
});

describe('setGroupPoints', () => {
  const closedLog = (): EstimateLog =>
    closeOpenGroup(recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000), 5);

  it('Given 閉じた束 / When ポイントを直す / Then points が変わる', () => {
    const log = setGroupPoints(closedLog(), 1, 8)._unsafeUnwrap();
    expect(log.groups[0]!.points).toBe(8);
  });

  it('Given 閉じた束 / When null を渡す / Then ポイントが消える', () => {
    const log = setGroupPoints(closedLog(), 1, null)._unsafeUnwrap();
    expect(log.groups[0]!.points).toBeNull();
  });

  it('Given 存在しない id / When 直す / Then estimate-not-found', () => {
    expect(setGroupPoints(closedLog(), 99, 8)._unsafeUnwrapErr()).toEqual({
      code: 'estimate-not-found',
    });
  });

  it('Given open の束 / When 直す / Then estimate-open', () => {
    const open = recordReveal(EMPTY_ESTIMATE_LOG, 'A', [num(5)], 1000);
    expect(setGroupPoints(open, 1, 8)._unsafeUnwrapErr()).toEqual({ code: 'estimate-open' });
  });
});

describe('上限', () => {
  it('Given 束を分けて 101 回開票 / When 数える / Then 行は 100 で、最初の束は消え、先頭の束の id は 2', () => {
    // Given
    let log: EstimateLog = EMPTY_ESTIMATE_LOG;
    for (let i = 0; i < MAX_ESTIMATE_ENTRIES + 1; i++) {
      log = closeOpenGroup(recordReveal(log, `I${i}`, [num(5)], i), 5);
    }
    // Then
    expect(totalEntries(log)).toBe(MAX_ESTIMATE_ENTRIES);
    expect(log.groups[0]!.id).toBe(2);
    expect(log.nextId).toBe(MAX_ESTIMATE_ENTRIES + 2);
  });

  it('Given 同じ束に 101 回 / When 数える / Then 行は 100 で attempt は 2 から 101', () => {
    // Given
    let log: EstimateLog = EMPTY_ESTIMATE_LOG;
    for (let i = 0; i < MAX_ESTIMATE_ENTRIES + 1; i++) {
      log = recordReveal(log, 'A', [num(5)], i);
    }
    // Then
    expect(log.groups).toHaveLength(1);
    const attempts = log.groups[0]!.entries.map((e) => e.attempt);
    expect(attempts).toHaveLength(MAX_ESTIMATE_ENTRIES);
    expect(attempts[0]).toBe(2);
    expect(attempts[attempts.length - 1]).toBe(MAX_ESTIMATE_ENTRIES + 1);
  });
});

describe('countCards', () => {
  it('Given 順不同のカード / When 数える / Then 匿名の枚数がデッキの順に並ぶ', () => {
    expect(countCards([num(8), num(5), question, num(5), coffee])).toEqual([
      { card: num(5), count: 2 },
      { card: num(8), count: 1 },
      { card: question, count: 1 },
      { card: coffee, count: 1 },
    ]);
  });

  it('Given デッキに無いカード / When 数える / Then 末尾に置かれる', () => {
    const odd = { kind: 'number', value: 4 } as unknown as Card;
    const counts = countCards([odd, num(5)]);
    expect(counts.map((c) => c.card)).toEqual([num(5), odd]);
  });

  it('Given 票が無い / When 数える / Then 空', () => {
    expect(countCards([])).toEqual([]);
  });
});
