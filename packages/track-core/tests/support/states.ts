/**
 * 試験の土台。時刻軸の 0 は単調時計の `EPOCH`、壁時計は `WALL`。
 * 位置で書けるよう、`at(分)` で「時刻軸の分 → 単調時計の値」に直す。
 */
import type { Result } from "neverthrow";
import { createTrackState, start, stop } from "../../src/track.js";
import type { Segment, TrackState } from "../../src/types.js";

export const EPOCH = 50_000;
/** 2026-11-23 10:00:00 JST（UTC 01:00） */
export const WALL = Date.UTC(2026, 10, 23, 1, 0, 0);
export const MIN = 60_000;

/** 時刻軸の位置（分）を単調時計の値に直す */
export const at = (minutes: number): number => EPOCH + minutes * MIN;

export const empty = (): TrackState => createTrackState({ mono: EPOCH, wallMs: WALL });

/** 成功値を取り出す（失敗なら落とす） */
export function must<E>(r: Result<TrackState, E>): TrackState {
  return r._unsafeUnwrap();
}

export const codeOf = (r: { _unsafeUnwrapErr(): { code: string } }): string => r._unsafeUnwrapErr().code;

/** 区切りを「名前:始まり-終わり」の形で読む（終わりが無ければ計測中）。位置は分 */
export const shape = (s: { segments: readonly Segment[] }): string[] =>
  s.segments.map((g) => `${g.kind === "break" ? "休憩" : g.label || "名前なし"}:${g.startMs / MIN}-${g.endMs === null ? "" : g.endMs / MIN}`);

/**
 * よく使う記録。0〜10 分「設計」・10〜30 分「実装」・30〜40 分 休憩・（隙間）・50 分〜「実装」計測中。
 */
export function sample(): TrackState {
  let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
  s = must(start(s, { label: "実装", kind: "work", now: at(10) }));
  s = must(start(s, { label: "", kind: "break", now: at(30) }));
  s = must(stop(s, { now: at(40) }));
  s = must(start(s, { label: "実装", kind: "work", now: at(50) }));
  return s;
}
