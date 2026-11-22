/**
 * うちわけの計測の遷移（#476・設計 §4.3）。
 *
 * **表現は直接遷移関数＋`Result`**（agenda-core の `agenda.ts` と同じ）。時計は引数で受ける（ドメインは環境を読まない）。
 * `now`・`at` は単調時計の値で、時刻軸の位置は `now - epochMono` で求める。
 * **状態が変わらないときは同じ参照を返す**（同期サーバーは参照の比較で「配るか」を決める）。変わるときは `rev` を 1 進める。
 * **誰が操作したかは受け取らない**（設計 §6）。
 */
import { err, ok, type Result } from "neverthrow";
import type { TrackError } from "./errors.js";
import { isValidLabel, normalizeLabel } from "./label.js";
import { MAX_PINNED, MAX_SEGMENTS, MIN_SEGMENT_MS, UNDO_WINDOW_MS, type BackMinutes } from "./limits.js";
import type { Segment, SegmentKind, TrackState, TrackView, UndoKind } from "./types.js";

const MS_PER_MIN = 60_000;

type R<C extends TrackError["code"] = never> = Result<TrackState, TrackError<C>>;

const fail = <C extends TrackError["code"]>(code: C): Result<never, TrackError<C>> => err({ code });

/** 状態を最初に置く。その時点が時刻軸の 0 になる（記録を消しても変えない）。 */
export function createTrackState(epoch: { mono: number; wallMs: number }): TrackState {
  return {
    epochMono: epoch.mono,
    epochWallMs: epoch.wallMs,
    segments: [],
    nextSeq: 1,
    pinned: [],
    rev: 0,
    undo: null,
    resumeOffer: false,
  };
}

/** 計測中の区切り（あれば最後の 1 つ）。 */
export function runningOf(segments: readonly Segment[]): Segment | undefined {
  const last = segments.at(-1);
  return last !== undefined && last.endMs === null ? last : undefined;
}

/** 種類に合わせた作業名。休憩はいつも空。受け取れない名前は null。 */
export function labelFor(kind: SegmentKind, raw: string): string | null {
  if (kind === "break") return "";
  const label = normalizeLabel(raw);
  return isValidLabel(label) ? label : null;
}

/**
 * 時間を動かす操作の後の状態。直前の区切りの列を写しに残す（取り消しのため）。
 * 区切りの番号（`nextSeq`）は写しに入れない（取り消しても番号を使い回さない。古い画面の操作が別の区切りに当たらないように）。
 */
function timed(s: TrackState, kind: UndoKind, now: number, patch: { segments: readonly Segment[]; nextSeq?: number }): TrackState {
  const rev = s.rev + 1;
  return {
    ...s,
    ...patch,
    rev,
    undo: { rev, kind, expiresAt: now + UNDO_WINDOW_MS, segments: s.segments, resumeOffer: s.resumeOffer },
    resumeOffer: false,
  };
}

/** 計測中の区切りを `t` で閉じた列。**最短の長さに満たない区切りは残さない**（閉じずに捨てる）。 */
function closeRunning(segments: readonly Segment[], running: Segment, t: number, autoClosed: boolean): Segment[] {
  const rest = segments.slice(0, -1);
  return t - running.startMs < MIN_SEGMENT_MS ? rest : [...rest, { ...running, endMs: t, autoClosed }];
}

/**
 * 開始と切り替え。計測中の区切りがあれば `t = いま − さかのぼり` で閉じ、同じ `t` から新しい区切りを始める。
 * 計測中の区切りと種類・作業名が同じなら何もしない。閉じる区切りが最短に満たなければ、新しい区切りがその始まりを引き継ぐ（付け替え）。
 */
export function start(
  s: TrackState,
  input: { label: string; kind: SegmentKind; backMin?: BackMinutes; now: number },
): R<"TRACK_INVALID_LABEL" | "TRACK_BACKDATE_TOO_FAR" | "TRACK_FULL"> {
  const label = labelFor(input.kind, input.label);
  if (label === null) return fail("TRACK_INVALID_LABEL");
  const running = runningOf(s.segments);
  if (running !== undefined && running.kind === input.kind && running.label === label) return ok(s);

  const t = input.now - s.epochMono - (input.backMin ?? 0) * MS_PER_MIN;
  let startMs = t;
  let kept: readonly Segment[] = s.segments;
  if (running !== undefined) {
    if (input.backMin !== undefined && t <= running.startMs) return fail("TRACK_BACKDATE_TOO_FAR");
    kept = closeRunning(s.segments, running, t, false);
    // 捨てた（短すぎた）なら、その始まりを引き継ぐ
    if (kept.length < s.segments.length) startMs = running.startMs;
  } else {
    const lastEnd = s.segments.at(-1)?.endMs ?? null;
    if (lastEnd !== null && t < lastEnd) return fail("TRACK_BACKDATE_TOO_FAR");
  }
  if (kept.length >= MAX_SEGMENTS) return fail("TRACK_FULL");
  const segment: Segment = { id: `g-${s.nextSeq}`, kind: input.kind, label, startMs, endMs: null, autoClosed: false };
  return ok(timed(s, "start", input.now, { segments: [...kept, segment], nextSeq: s.nextSeq + 1 }));
}

/** 停止。計測中の区切りを閉じる。計測していなければ何もしない。 */
export function stop(s: TrackState, input: { backMin?: BackMinutes; now: number }): R<"TRACK_BACKDATE_TOO_FAR"> {
  const running = runningOf(s.segments);
  if (running === undefined) return ok(s);
  const t = input.now - s.epochMono - (input.backMin ?? 0) * MS_PER_MIN;
  if (input.backMin !== undefined && t <= running.startMs) return fail("TRACK_BACKDATE_TOO_FAR");
  return ok(timed(s, "stop", input.now, { segments: closeRunning(s.segments, running, t, false) }));
}

/**
 * 取り消し。`rev` が取り消せる操作の番号と一致し、期限の内なら、その操作の直前の区切りの列へ戻す。
 * それ以外は何もしない（古い画面の取り消し・期限切れ）。定番は戻さない。
 */
export function undo(s: TrackState, input: { rev: number; now: number }): TrackState {
  const slot = s.undo;
  if (slot === null || slot.rev !== input.rev || input.now >= slot.expiresAt) return s;
  return { ...s, segments: slot.segments, resumeOffer: slot.resumeOffer, undo: null, rev: s.rev + 1 };
}

/**
 * 全員の切断による停止。計測中の区切りを、最後の接続が切れた時刻 `at` で閉じ、印と問いかけを立てる。
 * 最短に満たない区切りは捨て、問いかけも立てない（尋ねる対象が無い）。
 */
export function autoStop(s: TrackState, input: { at: number }): TrackState {
  const running = runningOf(s.segments);
  if (running === undefined) return s;
  const segments = closeRunning(s.segments, running, input.at - s.epochMono, true);
  return { ...s, segments, undo: null, resumeOffer: segments.length === s.segments.length, rev: s.rev + 1 };
}

/** 再開の問いかけを下ろす。 */
export function dismissOffer(s: TrackState): TrackState {
  if (!s.resumeOffer) return s;
  return { ...s, resumeOffer: false, undo: null, rev: s.rev + 1 };
}

/** 記録（区切りの列）を消す。定番と時刻軸の基準は残す。 */
export function clear(s: TrackState, now: number): TrackState {
  if (s.segments.length === 0) return s;
  return timed(s, "clear", now, { segments: [] });
}

/** 定番に固定する／外す。**取り消しの写しと問いかけには触らない**（定番は時間の記録と関係が無い）。 */
export function pin(s: TrackState, input: { label: string; pinned: boolean }): R<"TRACK_INVALID_LABEL" | "PIN_LIMIT"> {
  const label = labelFor("work", input.label);
  if (label === null || label === "") return fail("TRACK_INVALID_LABEL");
  const has = s.pinned.includes(label);
  if (has === input.pinned) return ok(s);
  if (!input.pinned) return ok({ ...s, pinned: s.pinned.filter((x) => x !== label), rev: s.rev + 1 });
  if (s.pinned.length >= MAX_PINNED) return fail("PIN_LIMIT");
  return ok({ ...s, pinned: [...s.pinned, label], rev: s.rev + 1 });
}

/** 画面へ送る写し。位置と取り消しの残りは `now` で計り、単調時計の値は載せない。 */
export function toView(s: TrackState, now: number): TrackView {
  const slot = s.undo;
  return {
    epochWallMs: s.epochWallMs,
    nowMs: now - s.epochMono,
    segments: s.segments,
    pinned: s.pinned,
    rev: s.rev,
    undo: slot !== null && now < slot.expiresAt ? { rev: slot.rev, kind: slot.kind, remainingMs: slot.expiresAt - now } : null,
    resumeOffer: s.resumeOffer,
  };
}
