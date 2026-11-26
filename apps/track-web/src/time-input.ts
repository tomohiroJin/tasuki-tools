/**
 * 時刻の入力（`<input type="time">` の値）を時刻軸の位置へ直す（#476・FR-17・FR-18）。**純粋関数。**
 *
 * 入力は日付を持たないので、**基準の位置より前の直近のその時刻**として読む
 * （入れた時刻が基準より後に見えるときは前日）。時間帯は呼ぶ側が渡す（UTC からの進み・分）。
 *
 * いまより後に見える時刻は前日として読む（0:10 に「23:00〜23:30」を足せる）。読み替えた結果が成り立たないときは、
 * 前日として読んだことが分かる誤りで返す（`insertRangeOf` の `yesterday`）。
 * 始まり・終わりを合わせる入力は分の単位なので、範囲の端の分を入れたら秒の端数つきの端へ寄せて受ける（`snapToRange`）。
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
  return readClock(clockMs, refPosMs, epochWallMs, tzOffsetMin).posMs;
}

/** `positionBefore` と同じ読み方で、前日へ読み替えたか（入れた時刻が基準より後に見えたか）も返す。 */
function readClock(clockMs: number, refPosMs: number, epochWallMs: number, tzOffsetMin: number): { posMs: number; wrapped: boolean } {
  const shift = tzOffsetMin * MS_PER_MIN;
  // その時間帯での「見かけの UTC」で日の頭を求める
  const refLocal = epochWallMs + refPosMs + shift;
  const dayStart = Math.floor(refLocal / MS_PER_DAY) * MS_PER_DAY;
  const wrapped = dayStart + clockMs > refLocal;
  const local = wrapped ? dayStart + clockMs - MS_PER_DAY : dayStart + clockMs;
  return { posMs: Math.round(local - shift - epochWallMs), wrapped };
}

/**
 * 分の単位で入れた時刻を、動かせる範囲 [min, max] へ収める。範囲に入らなければ null。
 * 範囲の端は秒の端数を持つので（± のボタンはそこへ届く）、端と同じ分を入れたら端そのものへ寄せる。
 * 秒つきの時刻（分の頭でない入力）は寄せない。
 */
function snapToRange(atMs: number, clockMs: number, range: { minMs: number; maxMs: number }): number | null {
  if (range.minMs > range.maxMs) return null;
  if (atMs >= range.minMs && atMs <= range.maxMs) {
    return clockMs % MS_PER_MIN === 0 && atMs < range.maxMs && atMs + MS_PER_MIN > range.maxMs ? range.maxMs : atMs;
  }
  if (clockMs % MS_PER_MIN === 0 && atMs < range.minMs && atMs + MS_PER_MIN > range.minMs) return range.minMs;
  return null;
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

export type InsertRangeError = 'time' | 'length' | 'order' | 'future' | 'yesterday';

export type InsertRange = { readonly ok: true; readonly startMs: number; readonly endMs: number } | { readonly ok: false; readonly error: InsertRangeError };

/**
 * 抜けを足す範囲。
 *
 * - 長さで指定: 始まりを「いま」より前の直近の時刻として読み、終わりが「いま」を越えたら拒む。
 * - 終わりで指定: 始まりも終わりも「いま」より前の直近の時刻として読む（後に見える時刻は前日）。
 *   終わりが前日へ読み替えられ、始まりより後にならないときは、`order` でなく `yesterday`（前日として読んだと示す文）で拒む。
 */
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
    const end = readClock(endClock, nowMs, epochWallMs, tzOffsetMin);
    endMs = end.posMs;
    if (end.wrapped && endMs - startMs < MIN_SEGMENT_MS) return { ok: false, error: 'yesterday' };
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
export function edgePositionOf(
  value: string,
  range: { minMs: number; maxMs: number } | null,
  epochWallMs: number,
  tzOffsetMin: number,
  /** 前日として読んでよいか。最初の区切りの始まりは下に区切りが無く、前日へ読むと 23 時間の区切りになるので、false にして拒む */
  allowPreviousDay = true,
): number | null {
  const clock = parseClock(value);
  if (clock === null || range === null) return null;
  const read = readClock(clock, range.maxMs, epochWallMs, tzOffsetMin);
  if (read.wrapped && !allowPreviousDay) return null;
  return snapToRange(read.posMs, clock, range);
}
