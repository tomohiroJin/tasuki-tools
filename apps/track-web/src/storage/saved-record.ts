/**
 * 端末に残す記録の形（#476 第 2 段・設計 §3 B2・B3）。純粋な関数だけで、ブラウザの API は読まない（保存は `saved-store.ts`）。
 *
 * - **残すのは区切りの列・`epochWallMs`・残した時刻・ID だけ。** ルーム名・ルームのコード・定番・取り消しの写しは残さない
 *   （ルームの識別子は人を辿る手がかりになる・原則 XI）。型がこの 4 項目しか持たないので、足し忘れても残らない
 * - **計測中の区切りは、残す時点で切る。** 残した記録に計測中は無い
 * - 読み戻しは境界で検証する（原則 IV）。壊れた値・古い形は捨てる。スキーマは `v.object` なので、余計な項目は読み戻さない
 */
import * as v from 'valibot';
import { MAX_LABEL, MAX_POSITION_MS, MAX_SEGMENTS, hasControlChars, type SegmentView, type TrackView } from '@tasuki/track-core';

/** 端末に残せる記録の最大数（B3）。超える保存では、いちばん古い 1 件を消す */
export const MAX_SAVED_RECORDS = 50;
/** 記録の版。**形を変えるときは上げ、古い版は読むときに畳む**（`docs/adr/0005`）。読めない版は一覧から外すだけで、上書きも削除もしない */
export const SAVED_RECORD_VERSION = 1;
const MAX_ID_LENGTH = 64;

const position = v.pipe(v.number(), v.finite(), v.minValue(-MAX_POSITION_MS), v.maxValue(MAX_POSITION_MS));

const SavedSegmentSchema = v.pipe(
  v.object({
    kind: v.picklist(['work', 'break']),
    label: v.pipe(
      v.string(),
      v.maxLength(MAX_LABEL),
      v.check((s) => !hasControlChars(s), 'label must not contain control characters'),
    ),
    startMs: position,
    endMs: position,
    autoClosed: v.boolean(),
  }),
  v.check((s) => s.endMs >= s.startMs, 'segment must not end before it starts'),
);

export const SavedRecordSchema = v.object({
  version: v.literal(SAVED_RECORD_VERSION),
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID_LENGTH)),
  /** 残した時刻（壁時計の ms。時刻軸から求める: `epochWallMs + nowMs`） */
  savedAtMs: v.pipe(v.number(), v.finite()),
  /** 時刻軸の 0 に当たる壁時計の ms */
  epochWallMs: v.pipe(v.number(), v.finite()),
  segments: v.pipe(v.array(SavedSegmentSchema), v.maxLength(MAX_SEGMENTS)),
});

export type SavedSegment = v.InferOutput<typeof SavedSegmentSchema>;
export type SavedRecord = v.InferOutput<typeof SavedRecordSchema>;

/**
 * ルームの写しから、残す記録を作る。計測中の区切りは `nowMs`（残す時点の、手元の時計の時刻軸の位置）で閉じた形で残す
 * （開くたびに伸びない）。残した時刻は `epochWallMs + nowMs`（端末の時計を別に読まない）。
 */
export function recordFromView(view: TrackView, nowMs: number, id: string): SavedRecord {
  return {
    version: SAVED_RECORD_VERSION,
    id,
    savedAtMs: view.epochWallMs + nowMs,
    epochWallMs: view.epochWallMs,
    segments: view.segments.map((g) => ({
      kind: g.kind,
      label: g.label,
      startMs: g.startMs,
      endMs: Math.max(g.startMs, g.endMs ?? nowMs),
      autoClosed: g.autoClosed,
    })),
  };
}

/** 残した記録を、表・Markdown・CSV に渡せる写しへ戻す（読むだけの画面用。`nowMs` は最後の終わり）。 */
export function viewOfRecord(record: SavedRecord): TrackView {
  const segments: SegmentView[] = record.segments.map((g, index) => ({ id: `g-${index + 1}`, ...g }));
  return {
    epochWallMs: record.epochWallMs,
    nowMs: segments.reduce((latest, g) => Math.max(latest, g.endMs ?? 0), 0),
    segments,
    pinned: [],
    rev: 0,
    undo: null,
    resumeOffer: false,
  };
}

/**
 * 保存したあとに上限を超えているぶんの ID（残した時刻の古い順。並びには依らない）。
 * `keepId`（いま残したばかりの記録）は、時刻が古くても消す候補にしない。
 */
export function evictedIds(records: readonly SavedRecord[], keepId?: string): string[] {
  const excess = records.length - MAX_SAVED_RECORDS;
  if (excess <= 0) return [];
  return records
    .filter((r) => r.id !== keepId)
    .sort((a, b) => a.savedAtMs - b.savedAtMs)
    .slice(0, excess)
    .map((r) => r.id);
}

/** 端末から読んだ 1 件を検証する。読めなければ null。 */
export function normalizeStoredRecord(raw: unknown): SavedRecord | null {
  const result = v.safeParse(SavedRecordSchema, raw);
  return result.success ? result.output : null;
}

/** 端末から読んだ値の列を、読める記録だけに畳む。 */
export function recordsFromStore(raw: readonly unknown[]): SavedRecord[] {
  return raw.map(normalizeStoredRecord).filter((r): r is SavedRecord => r !== null);
}

/** 一覧の並び（残した時刻の新しい順）。 */
export function newestFirst(records: readonly SavedRecord[]): SavedRecord[] {
  return [...records].sort((a, b) => b.savedAtMs - a.savedAtMs);
}
