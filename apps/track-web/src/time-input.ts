/**
 * 時刻の入力（`<input type="time">` の値）を時刻軸の位置へ直す（#476・FR-17・FR-18）。**純粋関数。**
 *
 * 入力は日付を持たないので、読み方は入力の場所ごとに決める。時間帯は呼ぶ側が渡す（UTC からの進み・分）。
 *
 * - 抜けを足す欄: **基準（いま）より前の直近のその時刻**として読む。いまより後に見える時刻は前日として読む（0:10 に「23:00〜23:30」を足せる）。
 *   読み替えた結果が手元の検査で拒まれるときは、前日として読んだことを添える（`InsertRange` の `yesterday`）。
 * - 分ける欄: 区切りの終わりより前の直近の時刻。
 * - 始まり・終わりを合わせる欄: 前日・当日・翌日の読み方のうち、**範囲に収まるものの中で、動かす前の端に最も近い日**のその時刻（`edgePositionOf`）。収まるものが無ければ拒む。
 *   範囲の端の分は、秒の端数つきの端へ寄せて受ける（`snapToRange`）。
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
 * 1 日の中の時刻を、基準の位置（`refPosMs`）の当日・前日・翌日の読み（位置）に直して、基準に近い順に返す。
 * 同じ距離なら当日・前日・翌日の順。
 */
function clockPositionsByDistance(clockMs: number, refPosMs: number, epochWallMs: number, tzOffsetMin: number): number[] {
  const shift = tzOffsetMin * MS_PER_MIN;
  const refLocal = epochWallMs + refPosMs + shift;
  const dayStart = Math.floor(refLocal / MS_PER_DAY) * MS_PER_DAY;
  return [0, -1, 1]
    .map((days) => dayStart + days * MS_PER_DAY + clockMs)
    .sort((a, b) => Math.abs(a - refLocal) - Math.abs(b - refLocal))
    .map((local) => Math.round(local - shift - epochWallMs));
}

/** 動かせる範囲の下限か上限か（`snapToRange` が見る） */
interface EdgeRange {
  readonly minMs: number;
  readonly maxMs: number;
  /** 下限が「いまから 24 時間前」（`MAX_LOOKBACK_MS`）で決まっているか。その端は時間とともに動くので、寄せない */
  readonly minIsLookback: boolean;
}

/**
 * 時刻を、動かせる範囲 [min, max] へ収める。範囲に入らなければ null。
 *
 * 範囲の端は秒の端数を持つので（± のボタンはそこへ届く）、**秒の欄の無い入力**（分の単位）が端と同じ分なら、端そのものへ寄せる。
 * 秒の欄のある入力（`10:10:00`）は寄せない。下限が「いまから 24 時間前」で決まっているときも寄せない
 * （その端は送るまでの間に動いて、サーバーの側で範囲の外になる）。
 */
function snapToRange(atMs: number, minuteOnly: boolean, range: EdgeRange): number | null {
  if (range.minMs > range.maxMs) return null;
  if (atMs >= range.minMs && atMs <= range.maxMs) {
    return minuteOnly && atMs < range.maxMs && atMs + MS_PER_MIN > range.maxMs ? range.maxMs : atMs;
  }
  if (minuteOnly && !range.minIsLookback && atMs < range.minMs && atMs + MS_PER_MIN > range.minMs) return range.minMs;
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

export type InsertRangeError = 'time' | 'length' | 'order' | 'future';

export type InsertRange =
  | { readonly ok: true; readonly startMs: number; readonly endMs: number }
  /** `yesterday`: 入れた時刻のどれかを前日として読み替えた結果の誤りか（画面は「前日の時刻として読みました」を添える） */
  | { readonly ok: false; readonly error: InsertRangeError; readonly yesterday: boolean };

const fail = (error: InsertRangeError, yesterday = false): InsertRange => ({ ok: false, error, yesterday });

/**
 * 抜けを足す範囲。始まりも終わりも「いま」より前の直近の時刻として読む（後に見える時刻は前日）。
 *
 * - 長さで指定: 終わりが「いま」を越えたら `future`。
 * - 終わりで指定: 終わりが始まり以前なら `order`。
 * - 長さの上限は設けない（08:00 に「18:00〜07:30」の 13.5 時間も足せる）。11:20 に「11:30〜11:00」と入れて 23.5 時間になる、のような
 *   思い違いは、押す前に読み取った範囲と長さを出して（`insertPreviewOf`）本人が気づけるようにする。
 *
 * 前日へ読み替えた時刻があるときは、どの誤りにも `yesterday` を付ける。
 */
export function insertRangeOf(input: InsertInput, nowMs: number, epochWallMs: number, tzOffsetMin: number): InsertRange {
  const startClock = parseClock(input.start);
  if (startClock === null) return fail('time');
  const start = readClock(startClock, nowMs, epochWallMs, tzOffsetMin);
  const startMs = start.posMs;
  let endMs: number;
  let yesterday = start.wrapped;
  if (input.mode === 'length') {
    if (!/^\d+$/.test(input.lengthMin)) return fail('length');
    const minutes = Number(input.lengthMin);
    if (minutes < 1 || minutes > MAX_LENGTH_MIN) return fail('length');
    endMs = startMs + minutes * MS_PER_MIN;
    if (endMs > nowMs) return fail('future', yesterday);
  } else {
    const endClock = parseClock(input.end);
    if (endClock === null) return fail('time');
    const end = readClock(endClock, nowMs, epochWallMs, tzOffsetMin);
    endMs = end.posMs;
    yesterday = start.wrapped || end.wrapped;
  }
  if (endMs - startMs < MIN_SEGMENT_MS) return fail('order', yesterday);
  return { ok: true, startMs, endMs };
}

/** 読み取った範囲（押す前に欄の中へ出す。`insertPreviewOf`） */
export interface InsertPreview {
  /** `HH:MM`（秒は出さない） */
  readonly startClock: string;
  /** 始まりが「いま」の日より前の日か（前日と添える） */
  readonly startYesterday: boolean;
  readonly endClock: string;
  readonly endYesterday: boolean;
  /** 長さ（分） */
  readonly lengthMin: number;
}

/** 位置を、その時間帯の `HH:MM` と、「いま」の日より前の日かにする。 */
function clockOfPosition(posMs: number, nowMs: number, epochWallMs: number, tzOffsetMin: number): { clock: string; yesterday: boolean } {
  const shift = tzOffsetMin * MS_PER_MIN;
  const local = epochWallMs + posMs + shift;
  const dayIndex = Math.floor(local / MS_PER_DAY);
  const minutes = Math.floor((local - dayIndex * MS_PER_DAY) / MS_PER_MIN);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    clock: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
    yesterday: dayIndex < Math.floor((epochWallMs + nowMs + shift) / MS_PER_DAY),
  };
}

/**
 * 抜けを足す欄に、押す前に出す「読み取った範囲と長さ」。`insertRangeOf` が受ける入力のときだけ返す（読み取れない入力は null）。
 * 終わりで指定しても長さで指定しても、同じ範囲なら同じ値になる。
 */
export function insertPreviewOf(input: InsertInput, nowMs: number, epochWallMs: number, tzOffsetMin: number): InsertPreview | null {
  const range = insertRangeOf(input, nowMs, epochWallMs, tzOffsetMin);
  if (!range.ok) return null;
  const start = clockOfPosition(range.startMs, nowMs, epochWallMs, tzOffsetMin);
  const end = clockOfPosition(range.endMs, nowMs, epochWallMs, tzOffsetMin);
  return {
    startClock: start.clock,
    startYesterday: start.yesterday,
    endClock: end.clock,
    endYesterday: end.yesterday,
    lengthMin: Math.floor((range.endMs - range.startMs) / MS_PER_MIN),
  };
}

/** 長さ（分）を `h:mm` にする。 */
export function lengthHm(lengthMin: number): string {
  return `${Math.floor(lengthMin / 60)}:${String(lengthMin % 60).padStart(2, '0')}`;
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
 * 始まり・終わりを合わせる時刻の位置。
 *
 * 時刻は、前日・当日・翌日の読み方のうち、**範囲に収まるもの**の中で、動かす前の端の位置（`currentMs`）に最も近い日の時刻として読む。
 * 収まる読み方が無ければ null。日をまたぐ区切りでも入れた時刻が端のすぐ近くの日に読まれ、終わりより後の時刻は範囲に収まらないので
 * 23 時間の区切りにならない。区切り 10:00〜10:30・いま 10:40 で始まりに 21:00 を入れれば、前日の 21:00 として受ける。範囲は track-core の `adjustRangeOf`（サーバーの判定と同じ規則）で求めたものを渡す。
 * `nowMs` は範囲を求めた「いま」。下限がこれから 24 時間前（`MAX_LOOKBACK_MS`）で決まっているかを見るのに使う。
 */
export function edgePositionOf(
  value: string,
  range: { minMs: number; maxMs: number } | null,
  currentMs: number,
  nowMs: number,
  epochWallMs: number,
  tzOffsetMin: number,
): number | null {
  const clock = parseClock(value);
  if (clock === null || range === null) return null;
  // 秒の欄の無い入力（`HH:MM`）だけが分の単位。`<input type="time">` は秒が 0 のとき秒の欄を省く
  const minuteOnly = value.length === 5;
  const edgeRange = { ...range, minIsLookback: range.minMs <= nowMs - MAX_LOOKBACK_MS };
  for (const atMs of clockPositionsByDistance(clock, currentMs, epochWallMs, tzOffsetMin)) {
    const snapped = snapToRange(atMs, minuteOnly, edgeRange);
    if (snapped !== null) return snapped;
  }
  return null;
}
