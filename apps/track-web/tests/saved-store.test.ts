/**
 * 端末の保存（IndexedDB）の出し入れ（#476 第 2 段 B3・B7）。偽の indexedDB の上で、実物の `saved-store` を通す。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SAVED_RECORDS, type SavedRecord } from '../src/storage/saved-record';
import { clearSaved, deleteSaved, loadSaved, saveRecord } from '../src/storage/saved-store';
import { installFakeIndexedDb, type FakeIndexedDb } from './support/fake-indexeddb';

const rec = (n: number): SavedRecord => ({
  version: 1,
  id: `r${n}`,
  savedAtMs: n,
  epochWallMs: 0,
  segments: [{ kind: 'work', label: `w${n}`, startMs: 0, endMs: 60_000, autoClosed: false }],
});

let fake: FakeIndexedDb;
beforeEach(() => {
  fake = installFakeIndexedDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const stored = (): Map<string, unknown> => fake.stores.get('saved-records')!;

describe('saved-store', () => {
  it('DB 名は tasuki-track。残した記録を新しい順に読める', async () => {
    await saveRecord(rec(1));
    await saveRecord(rec(3));
    await saveRecord(rec(2));
    expect(fake.opened[0]?.name).toBe('tasuki-track');
    expect((await loadSaved()).map((r) => r.id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('壊れた値・古い形は、読むときに一覧から外す', async () => {
    await saveRecord(rec(1));
    stored().set('broken', { id: 'broken' });
    stored().set('old', { id: 'old', savedAtMs: 5, segments: 'x' });
    expect((await loadSaved()).map((r) => r.id)).toEqual(['r1']);
  });

  it('余計な項目は読み戻さない', async () => {
    await loadSaved(); // ストアを作らせる
    stored().set('r1', { ...rec(1), roomCode: 'R1' });
    expect(await loadSaved()).toEqual([rec(1)]);
  });

  it('上限までは消さず、超える保存ではいちばん古い 1 件だけを消す', async () => {
    for (let n = 1; n <= MAX_SAVED_RECORDS; n += 1) await saveRecord(rec(n));
    expect(stored().size).toBe(MAX_SAVED_RECORDS);
    await saveRecord(rec(MAX_SAVED_RECORDS + 1));
    expect(stored().size).toBe(MAX_SAVED_RECORDS);
    expect(stored().has('r1')).toBe(false);
    expect(stored().has('r2')).toBe(true);
    expect(stored().has(`r${MAX_SAVED_RECORDS + 1}`)).toBe(true);
  });

  it('読めない記録（新しい版・壊れた値）は、残す・上限・全部消すのどれでも上書きも削除もしない', async () => {
    await loadSaved(); // ストアを作らせる
    const future = { ...rec(0), version: 2 };
    stored().set('r0', future);
    stored().set('broken', { id: 'broken' });
    for (let n = 1; n <= MAX_SAVED_RECORDS + 1; n += 1) await saveRecord(rec(n));
    expect(stored().get('r0')).toEqual(future);
    expect(stored().has('broken')).toBe(true);
    await clearSaved();
    expect([...stored().keys()].sort()).toEqual(['broken', 'r0']);
  });

  it('同じ ID で残し直すと置き換わる（件数は増えない）', async () => {
    await saveRecord(rec(1));
    await saveRecord({ ...rec(1), savedAtMs: 9 });
    expect(stored().size).toBe(1);
  });

  it('1 件を消す・全部を消す', async () => {
    await saveRecord(rec(1));
    await saveRecord(rec(2));
    await deleteSaved('r1');
    expect((await loadSaved()).map((r) => r.id)).toEqual(['r2']);
    await clearSaved();
    expect(await loadSaved()).toEqual([]);
  });
});
