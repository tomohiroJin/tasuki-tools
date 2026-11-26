/**
 * 端末に残す記録の形（#476 第 2 段 B2・B3）。残すものと残さないもの・境界の検証・上限。
 */
import { describe, expect, it } from 'vitest';
import { MAX_LABEL, MAX_SAVED_RECORDS, MAX_SEGMENTS, toCsv, toMarkdown, type TrackView } from '@tasuki/track-core';
import { evictedIds, normalizeStoredRecord, recordFromView, recordsFromStore, viewOfRecord } from '../src/storage/saved-record';
import { MIN, runningTrack, trackView, seg } from './support/track-states';

describe('recordFromView: 残すものを選ぶ', () => {
  it('区切り・epochWallMs・残した時刻・ID だけを残す（ルーム名・コード・定番・取り消しの写しは残さない）', () => {
    const view: TrackView = { ...runningTrack(60 * MIN), pinned: ['定番の作業'] };
    const record = recordFromView(view, 60 * MIN, 1_700_000_000_000, 'id-1');
    expect(Object.keys(record).sort()).toEqual(['epochWallMs', 'id', 'savedAtMs', 'segments']);
    expect(JSON.stringify(record)).not.toContain('定番の作業');
    expect(record.savedAtMs).toBe(1_700_000_000_000);
    expect(record.epochWallMs).toBe(view.epochWallMs);
    for (const s of record.segments) expect(Object.keys(s).sort()).toEqual(['autoClosed', 'endMs', 'kind', 'label', 'startMs']);
  });

  it('計測中の区切りは、残す時点で切る', () => {
    const record = recordFromView(runningTrack(60 * MIN), 60 * MIN, 1, 'id-1');
    expect(record.segments.at(-1)).toMatchObject({ label: 'Build', startMs: 45 * MIN, endMs: 60 * MIN });
  });

  it('残した記録を写しへ戻すと、残した時点で切った CSV と同じになる（計測中の印だけが無い）', () => {
    const view = runningTrack(60 * MIN);
    const record = recordFromView(view, 60 * MIN, 1, 'id-1');
    const restored = viewOfRecord(record);
    expect(toCsv(restored, restored.nowMs, 540)).toBe(toCsv(view, 60 * MIN, 540));
    expect(toMarkdown(restored, restored.nowMs, 540)).toContain('10:45–11:00 Build');
  });
});

describe('normalizeStoredRecord: 読み戻しの境界', () => {
  const good = () => recordFromView(runningTrack(60 * MIN), 60 * MIN, 1_700_000_000_000, 'id-1');

  it('正しい形はそのまま通す', () => {
    expect(normalizeStoredRecord(good())).toEqual(good());
  });

  it('余計な項目（ルーム名など）は読み戻さない', () => {
    const read = normalizeStoredRecord({ ...good(), roomCode: 'R1', roomName: '開発チーム' });
    expect(read).toEqual(good());
    expect(read).not.toHaveProperty('roomCode');
  });

  it.each([
    ['オブジェクトでない', 'x'],
    ['null', null],
    ['id が無い', { ...good(), id: undefined }],
    ['id が空', { ...good(), id: '' }],
    ['savedAtMs が数でない', { ...good(), savedAtMs: '1' }],
    ['epochWallMs が有限でない', { ...good(), epochWallMs: Number.POSITIVE_INFINITY }],
    ['segments が配列でない', { ...good(), segments: 'x' }],
    ['kind が知らない値', { ...good(), segments: [{ kind: 'meeting', label: '', startMs: 0, endMs: 1, autoClosed: false }] }],
    ['endMs が null（計測中は残さない）', { ...good(), segments: [{ kind: 'work', label: '', startMs: 0, endMs: null, autoClosed: false }] }],
    ['終わりが始まりより前', { ...good(), segments: [{ kind: 'work', label: '', startMs: 10, endMs: 5, autoClosed: false }] }],
    ['作業名に制御文字', { ...good(), segments: [{ kind: 'work', label: 'a\nb', startMs: 0, endMs: 1, autoClosed: false }] }],
    ['作業名が長すぎる', { ...good(), segments: [{ kind: 'work', label: 'a'.repeat(MAX_LABEL + 1), startMs: 0, endMs: 1, autoClosed: false }] }],
    ['位置が桁外れ', { ...good(), segments: [{ kind: 'work', label: '', startMs: 0, endMs: 1e15, autoClosed: false }] }],
    ['区切りが多すぎる', { ...good(), segments: Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => ({ kind: 'work', label: '', startMs: i, endMs: i + 1, autoClosed: false })) }],
  ])('壊れた形（%s）は捨てる', (_name, raw) => {
    expect(normalizeStoredRecord(raw)).toBeNull();
  });

  it('recordsFromStore は読めない値を一覧から外す', () => {
    expect(recordsFromStore([good(), { id: 'broken' }, 7])).toEqual([good()]);
  });
});

describe('evictedIds: 上限', () => {
  const rec = (n: number) => ({ id: `r${n}`, savedAtMs: n, epochWallMs: 0, segments: [] });

  it('上限までは何も消さない', () => {
    expect(evictedIds(Array.from({ length: MAX_SAVED_RECORDS }, (_, i) => rec(i)))).toEqual([]);
  });

  it('上限を超えたぶんだけ、古いものから消す（並びに依らない）', () => {
    const all = Array.from({ length: MAX_SAVED_RECORDS + 2 }, (_, i) => rec(i));
    expect(evictedIds([...all].reverse())).toEqual(['r0', 'r1']);
  });

  it('上限は 50 件', () => {
    expect(MAX_SAVED_RECORDS).toBe(50);
  });
});

describe('viewOfRecord', () => {
  it('区切りに通し番号の ID を振り、計測中は無い', () => {
    const view = viewOfRecord({ id: 'x', savedAtMs: 1, epochWallMs: 5, segments: [{ kind: 'work', label: 'a', startMs: 0, endMs: MIN, autoClosed: false }] });
    expect(view.segments).toEqual([seg('g-1', 'work', 'a', 0, MIN)]);
    expect(view.nowMs).toBe(MIN);
    expect(trackView().segments).toEqual([]);
  });
});
