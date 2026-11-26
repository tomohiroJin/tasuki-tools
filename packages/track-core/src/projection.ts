/**
 * うちわけの写しから導く値（#476・設計 §4.5）。**すべて純粋関数**で、画面と Markdown が同じ規則を使う。
 */
import { hasControlChars, normalizeLabel } from "./label.js";
import { LONG_RUNNING_NOTICE_MS, MAX_CANDIDATES, MAX_LABEL } from "./limits.js";
import type { SegmentView, TrackView } from "./types.js";

/** 画面の「いま」の位置。送る時点の位置に、受け取ってからの経過を足す。 */
export function advanceNow(view: TrackView, sinceReceivedMs: number): number {
  return view.nowMs + Math.max(0, sinceReceivedMs);
}

/** 計測中の区切り（止まっていれば null）。 */
export function runningSegmentOf(view: TrackView): SegmentView | null {
  const last = view.segments.at(-1);
  return last !== undefined && last.endMs === null ? last : null;
}

/** 区切りの長さ。計測中は `nowMs` まで。 */
export function durationOf(segment: SegmentView, nowMs: number): number {
  return Math.max(0, (segment.endMs ?? nowMs) - segment.startMs);
}

export interface TotalRow {
  /** 作業名（"" は名前なし） */
  readonly label: string;
  readonly ms: number;
  /** 作業の合計に対する割合（0〜1。丸める前の値） */
  readonly ratio: number;
}

export interface Totals {
  /** 作業名ごとの合計。合計の降順（同じなら先に現れた順） */
  readonly rows: readonly TotalRow[];
  /** 作業の合計（休憩を含めない） */
  readonly workMs: number;
  /** 休憩の合計 */
  readonly breakMs: number;
  /** 作業＋休憩（隙間は数えない） */
  readonly totalMs: number;
}

/** 集計。**休憩は作業名ごとの合計と割合から外す。割合は丸める前の値から計算する。** */
export function totalsOf(view: TrackView, nowMs: number): Totals {
  const byLabel = new Map<string, number>();
  let breakMs = 0;
  for (const g of view.segments) {
    const ms = durationOf(g, nowMs);
    if (g.kind === "break") breakMs += ms;
    else byLabel.set(g.label, (byLabel.get(g.label) ?? 0) + ms);
  }
  const workMs = [...byLabel.values()].reduce((a, b) => a + b, 0);
  // Map は挿入順を保ち、sort は安定なので、同じ合計は先に現れた順のまま残る
  const rows = [...byLabel]
    .map(([label, ms]) => ({ label, ms, ratio: workMs === 0 ? 0 : ms / workMs }))
    .sort((a, b) => b.ms - a.ms);
  return { rows, workMs, breakMs, totalMs: workMs + breakMs };
}

export interface Candidate {
  readonly label: string;
  /** どこから来た候補か */
  readonly source: "topic" | "pinned" | "recent";
  /** 定番に固定されているか */
  readonly pinned: boolean;
}

/** 文字の途中（サロゲートの間）で切らずに、UTF-16 の長さを上限に収める。 */
function truncate(s: string, max: number): string {
  let out = "";
  for (const ch of s) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

/** お題のタイトルを作業名の形にする。候補にできなければ null。 */
function topicLabel(title: string | null): string | null {
  if (title === null) return null;
  const label = truncate(normalizeLabel(title), MAX_LABEL).trim();
  return label === "" || hasControlChars(label) ? null : label;
}

/**
 * 切り替えの候補。お題のタイトル → 定番 → 最近使った作業名（新しい順）を、重複を除いて上限まで。
 * 全員が同じ写しとお題を持つので、数字キーとの対応は全員で同じになる。
 */
export function candidatesOf(view: TrackView, topicTitle: string | null): Candidate[] {
  const pinned = new Set(view.pinned);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  // 計測中の作業と同じ名前は、押しても何も起きないので候補から外す（休憩・名前なしは名前を持たない）
  const running = runningSegmentOf(view);
  const runningLabel = running !== null && running.kind === "work" ? running.label : "";
  const push = (label: string, source: Candidate["source"]): void => {
    if (label === runningLabel || seen.has(label) || out.length >= MAX_CANDIDATES) return;
    seen.add(label);
    out.push({ label, source, pinned: pinned.has(label) });
  };
  const topic = topicLabel(topicTitle);
  if (topic !== null) push(topic, "topic");
  for (const label of view.pinned) push(label, "pinned");
  for (let i = view.segments.length - 1; i >= 0; i--) {
    const g = view.segments[i]!;
    if (g.kind === "work" && g.label !== "") push(g.label, "recent");
  }
  return out;
}

/**
 * 「直前の作業名」（C キー）。計測中は、いまの区切りと違う名前のうち最も新しい作業。
 * 止まっているとき（と、休憩・名前なしを計測中のとき）は、最も新しい名前のある作業。無ければ null。
 */
export function previousLabelOf(view: TrackView): string | null {
  const running = runningSegmentOf(view);
  const current = running !== null && running.kind === "work" ? running.label : "";
  for (let i = view.segments.length - 1; i >= 0; i--) {
    const g = view.segments[i]!;
    if (g.kind === "work" && g.label !== "" && g.label !== current) return g.label;
  }
  return null;
}

/** 止め忘れの知らせの対象。計測中の区切りが `LONG_RUNNING_NOTICE_MS` 続いていれば、その区切り。 */
export function longRunningOf(view: TrackView, nowMs: number): SegmentView | null {
  const running = runningSegmentOf(view);
  return running !== null && nowMs - running.startMs >= LONG_RUNNING_NOTICE_MS ? running : null;
}
