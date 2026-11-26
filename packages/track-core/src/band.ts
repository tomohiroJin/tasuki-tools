/**
 * 時系列の帯の並び（#476 第 2 段・設計 §5 D4・D5）。**純粋関数**。
 *
 * 横軸は時刻。最初の区切りの始まりから、いま（止まっていれば最後の終わり）までを 1 本に取り、
 * 作業・休憩・隙間（計測していなかった時間）を始まりの順に並べる。
 * 帯は動かさない（D5）。計測中の「いま」は 1 分の刻みに切り下げ、画面は刻みが進んだときだけ描き直す。
 */
import { runningSegmentOf } from "./projection.js";
import type { TrackView } from "./types.js";

/** 帯の「いま」の刻み（1 分） */
export const BAND_STEP_MS = 60_000;

export interface BandPart {
  /** gap = 計測していなかった時間 */
  readonly kind: "work" | "break" | "gap";
  /** 作業名（"" は名前なし。休憩・隙間は ""） */
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
  /** 長さ（> 0）。帯の中の幅の重み */
  readonly ms: number;
}

export interface Band {
  readonly startMs: number;
  readonly endMs: number;
  /** 計測中か（計測中なら右端は刻みへ切り下げた位置。画面の端の時刻は「いま」から求める） */
  readonly running: boolean;
  readonly parts: readonly BandPart[];
}

/** 時刻軸の位置を 1 分の刻みに切り下げる。 */
export function stepDown(posMs: number): number {
  return Math.floor(Math.max(0, posMs) / BAND_STEP_MS) * BAND_STEP_MS;
}

/** 帯の並び。区切りが無ければ null。 */
export function bandOf(view: TrackView, nowMs: number): Band | null {
  const first = view.segments[0];
  const last = view.segments.at(-1);
  if (first === undefined || last === undefined) return null;
  const running = runningSegmentOf(view);
  const endMs = running === null ? last.endMs! : Math.max(stepDown(nowMs), running.startMs + 1);
  const parts: BandPart[] = [];
  let cursor = first.startMs;
  for (const segment of view.segments) {
    if (segment.startMs > cursor) {
      parts.push({ kind: "gap", label: "", startMs: cursor, endMs: segment.startMs, ms: segment.startMs - cursor });
    }
    const segmentEnd = segment.endMs ?? endMs;
    if (segmentEnd > segment.startMs) {
      parts.push({ kind: segment.kind, label: segment.label, startMs: segment.startMs, endMs: segmentEnd, ms: segmentEnd - segment.startMs });
    }
    cursor = Math.max(cursor, segmentEnd);
  }
  return endMs > first.startMs ? { startMs: first.startMs, endMs, running: running !== null, parts } : null;
}
