/**
 * 時刻の入力（`<input type="time">` の値）を時刻軸の位置へ直す（#476・FR-17・FR-18）。**純粋関数。**
 *
 * 入力は日付を持たないので、**基準の位置より前の直近のその時刻**として読む
 * （入れた時刻が基準より後に見えるときは前日）。時間帯は呼ぶ側が渡す（UTC からの進み・分）。
 */
import { MAX_LOOKBACK_MS, MIN_SEGMENT_MS, type SegmentView } from '@tasuki/track-core';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;
/** 長さの入力の上限（分）。手直しで置ける範囲（24 時間）に合わせる */
const MAX_LENGTH_MIN = 24 * 60;

/** `HH:MM`（か `HH:MM:SS`）を、1 日の中の ms にする。読めなければ null。 */
export function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (match === null) return null;
  const [hours, minutes, seconds] = [Number(match[1]), Number(match[2]), Number(match[3] ?? '0')];
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return (hours * 60 + minutes) * MS_PER_MIN + seconds * 1000;
}

/** 1 日の中の時刻を、基準の位置（`refPosMs`）以前の直近のその時刻の位置へ直す。 */
export function positionBefore(clockMs: number, refPosMs: number, epochWallMs: number, tzOffsetMin: number): number {
  const shift = tzOffsetMin * MS_PER_MIN;
  // その時間帯での「見かけの UTC」で日の頭を求める
  const refLocal = epochWallMs + refPosMs + shift;
  const dayStart = Math.floor(refLocal / MS_PER_DAY) * MS_PER_DAY;
  const local = dayStart + clockMs <= refLocal ? dayStart + clockMs : dayStart + clockMs - MS_PER_DAY;
  return Math.round(local - shift - epochWallMs);
}

export interface InsertInput {
  /** 始まりの時刻（`<input type="time">` の値） */
  readonly start: string;
  /** 時間の指定の仕方 */
  readonly mode: 'end' | 'length';
  /** 終わりの時刻（mode が end のとき） */
  readonly end: string;
  /** 長さ（分。mode が length のとき） */
  readonly lengthMin: string;
}

export type InsertRangeError = 'time' | 'length' | 'order' | 'future';

export type InsertRange = { readonly ok: true; readonly startMs: number; readonly endMs: number } | { readonly ok: false; readonly error: InsertRangeError };

/** 抜けを足す範囲。始まりも終わりも「いま」より前の直近の時刻として読む。 */
export function insertRangeOf(input: InsertInput, nowMs: number, epochWallMs: number, tzOffsetMin: number): InsertRange {
  const startClock = parseClock(input.start);
  if (startClock === null) return { ok: false, error: 'time' };
  const startMs = positionBefore(startClock, nowMs, epochWallMs, tzOffsetMin);
  let endMs: number;
  if (input.mode === 'length') {
    if (!/^\d+$/.test(input.lengthMin)) return { ok: false, error: 'length' };
    const minutes = Number(input.lengthMin);
    if (minutes < 1 || minutes > MAX_LENGTH_MIN) return { ok: false, error: 'length' };
    endMs = startMs + minutes * MS_PER_MIN;
    if (endMs > nowMs) return { ok: false, error: 'future' };
  } else {
    const endClock = parseClock(input.end);
    if (endClock === null) return { ok: false, error: 'time' };
    endMs = positionBefore(endClock, nowMs, epochWallMs, tzOffsetMin);
  }
  if (endMs - startMs < MIN_SEGMENT_MS) return { ok: false, error: 'order' };
  return { ok: true, startMs, endMs };
}

/**
 * 分ける時刻の位置。区切りの終わり（計測中は「いま」）より前の直近の時刻として読み、
 * 前半・後半のどちらも最短の長さを保て、「いま」から 24 時間より前でない位置だけを返す（それ以外は null）。
 */
export function splitPositionOf(value: string, segment: Pick<SegmentView, 'startMs' | 'endMs'>, nowMs: number, epochWallMs: number, tzOffsetMin: number): number | null {
  const clock = parseClock(value);
  if (clock === null) return null;
  const endMs = segment.endMs ?? nowMs;
  const atMs = positionBefore(clock, endMs, epochWallMs, tzOffsetMin);
  // サーバーの分割と同じ範囲にする（「いま」から 24 時間より前でも分けられない）。食い違うと、送ってから拒まれて入れた時刻が消える
  return atMs >= segment.startMs + MIN_SEGMENT_MS && atMs <= endMs - MIN_SEGMENT_MS && atMs >= nowMs - MAX_LOOKBACK_MS ? atMs : null;
}

/**
 * 始まり・終わりを合わせる時刻の位置。動かせる範囲の上限より前の直近の時刻として読み、範囲に入る位置だけを返す（それ以外は null）。
 * 範囲は track-core の `adjustRangeOf`（サーバーの判定と同じ規則）で求めたものを渡す。
 */
export function edgePositionOf(value: string, range: { minMs: number; maxMs: number } | null, epochWallMs: number, tzOffsetMin: number): number | null {
  const clock = parseClock(value);
  if (clock === null || range === null) return null;
  const atMs = positionBefore(clock, range.maxMs, epochWallMs, tzOffsetMin);
  return atMs >= range.minMs ? atMs : null;
}
