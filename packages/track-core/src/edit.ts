/**
 * うちわけの手直し（#476・設計 §4.3「手直しの制約」）。
 *
 * 名前と種類の付け替え・始まりと終わりの調整・分割・後からの追加（上書き）・削除。
 * どの操作も、区切りが昇順で重ならず、閉じた区切りが最短の長さ以上であることを保つ。
 * **手直しは取り消しの写しを捨て、再開の問いかけを下ろす**（対象の区切りが変わった後に、古い写しや問いかけを残さない）。
 */
import { err, ok, type Result } from "neverthrow";
import type { TrackError } from "./errors.js";
import { MAX_LOOKBACK_MS, MAX_SEGMENTS, MIN_SEGMENT_MS } from "./limits.js";
import { labelFor } from "./track.js";
import type { Segment, SegmentKind, TrackState } from "./types.js";

type R<C extends TrackError["code"] = never> = Result<TrackState, TrackError<C>>;

const fail = <C extends TrackError["code"]>(code: C): Result<never, TrackError<C>> => err({ code });

/** 手直しの後の状態。 */
function edited(s: TrackState, patch: { segments: readonly Segment[]; nextSeq?: number }): TrackState {
  return { ...s, ...patch, undo: null, resumeOffer: false, rev: s.rev + 1 };
}

const replaceAt = (segments: readonly Segment[], index: number, segment: Segment): Segment[] =>
  segments.map((g, i) => (i === index ? segment : g));

/** 名前と種類を付け替える。計測中の区切りにも使える。休憩へ変えると名前は空になる。 */
export function setSegment(
  s: TrackState,
  input: { id: string; label: string; kind: SegmentKind },
): R<"SEGMENT_NOT_FOUND" | "TRACK_INVALID_LABEL"> {
  const index = s.segments.findIndex((g) => g.id === input.id);
  const segment = s.segments[index];
  if (segment === undefined) return fail("SEGMENT_NOT_FOUND");
  const label = labelFor(input.kind, input.label);
  if (label === null) return fail("TRACK_INVALID_LABEL");
  if (segment.kind === input.kind && segment.label === label) return ok(s);
  return ok(edited(s, { segments: replaceAt(s.segments, index, { ...segment, kind: input.kind, label }) }));
}

/** 区切りの端 */
export type SegmentEdge = "start" | "end";

/**
 * 端を動かせる範囲（両端を含む）。**調整の判定と、画面の ± のボタンの範囲が同じ規則を使う**ための正本。
 *
 * - 「接している」（前の終わりと次の始まりが同じ位置）境界は隣ごと動くので、隣の反対の端の 1 つ内側まで
 * - 隙間の側の端は、隣の端まで（隙間を使い切った所で止まる。隣へは食い込めない）
 * - 「いま」より先・「いま」から `MAX_LOOKBACK_MS` より前へは置けない
 *
 * 計測中の区切りの終わり・無い区切り・動かせる所が無い端は null。
 */
export function adjustRangeOf(
  segments: readonly Segment[],
  id: string,
  edge: SegmentEdge,
  nowMs: number,
): { minMs: number; maxMs: number } | null {
  const index = segments.findIndex((g) => g.id === id);
  const segment = segments[index];
  if (segment === undefined) return null;
  let range: { minMs: number; maxMs: number };
  if (edge === "start") {
    const prev = segments[index - 1];
    const floor = prev === undefined || prev.endMs === null ? -Infinity : prev.endMs === segment.startMs ? prev.startMs + MIN_SEGMENT_MS : prev.endMs;
    range = { minMs: Math.max(floor, nowMs - MAX_LOOKBACK_MS), maxMs: (segment.endMs ?? nowMs) - MIN_SEGMENT_MS };
  } else {
    if (segment.endMs === null) return null;
    const next = segments[index + 1];
    const ceiling = next === undefined ? nowMs : next.startMs === segment.endMs ? (next.endMs ?? nowMs) - MIN_SEGMENT_MS : next.startMs;
    range = { minMs: Math.max(segment.startMs + MIN_SEGMENT_MS, nowMs - MAX_LOOKBACK_MS), maxMs: Math.min(ceiling, nowMs) };
  }
  return range.minMs <= range.maxMs ? range : null;
}

/** 区切りの始まりか終わりを `atMs` へ動かす。接している境界は隣ごと動く。 */
export function adjustSegment(
  s: TrackState,
  input: { id: string; edge: SegmentEdge; atMs: number; now: number },
): R<"SEGMENT_NOT_FOUND" | "SEGMENT_RUNNING" | "TRACK_INVALID_RANGE"> {
  const index = s.segments.findIndex((g) => g.id === input.id);
  const segment = s.segments[index];
  if (segment === undefined) return fail("SEGMENT_NOT_FOUND");
  if (input.edge === "end" && segment.endMs === null) return fail("SEGMENT_RUNNING");
  const current = input.edge === "start" ? segment.startMs : segment.endMs;
  if (input.atMs === current) return ok(s);
  const range = adjustRangeOf(s.segments, input.id, input.edge, input.now - s.epochMono);
  if (range === null || input.atMs < range.minMs || input.atMs > range.maxMs) return fail("TRACK_INVALID_RANGE");

  const segments = s.segments.map((g, i): Segment => {
    if (input.edge === "start") {
      if (i === index) return { ...g, startMs: input.atMs };
      // 接していた前の区切りは、終わりが一緒に動く（終わりが動いたので、切断で閉じた印は外す）
      if (i === index - 1 && g.endMs === segment.startMs) return { ...g, endMs: input.atMs, autoClosed: false };
      return g;
    }
    if (i === index) return { ...g, endMs: input.atMs, autoClosed: false };
    if (i === index + 1 && g.startMs === segment.endMs) return { ...g, startMs: input.atMs };
    return g;
  });
  return ok(edited(s, { segments }));
}

/** 区切りを `atMs` で 2 つに分け、後半に名前と種類を付ける。計測中の区切りを分けると、後半が計測中になる。 */
export function splitSegment(
  s: TrackState,
  input: { id: string; atMs: number; label: string; kind: SegmentKind; now: number },
): R<"SEGMENT_NOT_FOUND" | "TRACK_INVALID_LABEL" | "TRACK_INVALID_RANGE" | "TRACK_FULL"> {
  const index = s.segments.findIndex((g) => g.id === input.id);
  const segment = s.segments[index];
  if (segment === undefined) return fail("SEGMENT_NOT_FOUND");
  const label = labelFor(input.kind, input.label);
  if (label === null) return fail("TRACK_INVALID_LABEL");
  const nowMs = input.now - s.epochMono;
  const end = segment.endMs ?? nowMs;
  // 分ける位置も、ほかの手直しと同じく「いま」から `MAX_LOOKBACK_MS` より前へは置けない
  if (input.atMs < segment.startMs + MIN_SEGMENT_MS || input.atMs > end - MIN_SEGMENT_MS || input.atMs < nowMs - MAX_LOOKBACK_MS) return fail("TRACK_INVALID_RANGE");
  if (s.segments.length >= MAX_SEGMENTS) return fail("TRACK_FULL");
  const head: Segment = { ...segment, endMs: input.atMs, autoClosed: false };
  // 終わりは後半の持ち物なので、切断で閉じた印は後半が引き継ぐ
  const tail: Segment = { id: `g-${s.nextSeq}`, kind: input.kind, label, startMs: input.atMs, endMs: segment.endMs, autoClosed: segment.autoClosed };
  return ok(edited(s, { segments: [...s.segments.slice(0, index), head, tail, ...s.segments.slice(index + 1)], nextSeq: s.nextSeq + 1 }));
}

/**
 * 後からの追加。その範囲を新しい区切りで**上書きする**（重なった区切りは削る・分ける・消す）。
 *
 * 削った残りが最短の長さに満たないときは、その端切れを新しい区切りへ含める
 * （分単位で入れた時刻と ms の境界のずれで、見えない端切れを残さない）。
 * 計測中の区切りの中にも置け、そのとき後ろの残りが計測中のまま続く。
 */
export function insertSegment(
  s: TrackState,
  input: { startMs: number; endMs: number; label: string; kind: SegmentKind; now: number },
): R<"TRACK_INVALID_LABEL" | "TRACK_INVALID_RANGE" | "TRACK_FULL"> {
  const label = labelFor(input.kind, input.label);
  if (label === null) return fail("TRACK_INVALID_LABEL");
  const nowMs = input.now - s.epochMono;
  if (input.endMs - input.startMs < MIN_SEGMENT_MS || input.endMs > nowMs || input.startMs < nowMs - MAX_LOOKBACK_MS) {
    return fail("TRACK_INVALID_RANGE");
  }

  let from = input.startMs;
  let to = input.endMs;
  const insertedId = `g-${s.nextSeq}`;
  let nextSeq = s.nextSeq + 1;
  const before: Segment[] = [];
  const after: Segment[] = [];
  for (const g of s.segments) {
    const end = g.endMs ?? nowMs;
    if (end <= input.startMs) {
      before.push(g);
      continue;
    }
    if (g.startMs >= input.endMs) {
      after.push(g);
      continue;
    }
    // 重なった区切り。前の残りは元の番号を保ち、後ろの残りは（前の残りがあれば）新しい番号を取る
    const hasHead = g.startMs < input.startMs;
    if (hasHead) {
      if (input.startMs - g.startMs < MIN_SEGMENT_MS) from = g.startMs;
      else before.push({ ...g, endMs: input.startMs, autoClosed: false });
    }
    // 計測中の残りは、長さに関わらず（「いま」まで足したときも）計測中のまま続ける
    if (g.endMs === null || end > input.endMs) {
      if (g.endMs !== null && end - input.endMs < MIN_SEGMENT_MS) to = end;
      else after.push({ ...g, id: hasHead && from === input.startMs ? `g-${nextSeq++}` : g.id, startMs: input.endMs });
    }
  }
  const inserted: Segment = { id: insertedId, kind: input.kind, label, startMs: from, endMs: to, autoClosed: false };
  const segments = [...before, inserted, ...after];
  if (segments.length > MAX_SEGMENTS) return fail("TRACK_FULL");
  return ok(edited(s, { segments, nextSeq }));
}

/** 閉じた区切りを消す。その時間は隙間になる。 */
export function removeSegment(s: TrackState, input: { id: string }): R<"SEGMENT_NOT_FOUND" | "SEGMENT_RUNNING"> {
  const segment = s.segments.find((g) => g.id === input.id);
  if (segment === undefined) return fail("SEGMENT_NOT_FOUND");
  if (segment.endMs === null) return fail("SEGMENT_RUNNING");
  return ok(edited(s, { segments: s.segments.filter((g) => g !== segment) }));
}
