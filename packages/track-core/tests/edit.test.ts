import { describe, expect, it } from "vitest";
import { adjustRangeOf, adjustSegment, away, insertSegment, removeSegment, setSegment, splitSegment } from "../src/edit.js";
import { MAX_LOOKBACK_MS, MAX_SEGMENTS, MIN_SEGMENT_MS } from "../src/limits.js";
import { autoStop, start, stop, toView, undo } from "../src/track.js";
import type { TrackState } from "../src/types.js";
import { MIN, at, codeOf, empty, must, sample, shape } from "./support/states.js";

/** sample(): g-1 設計 0-10・g-2 実装 10-30・g-3 休憩 30-40・（隙間）・g-4 実装 50-（計測中） */
const NOW = at(60);

describe("setSegment（名前と種類の付け替え）", () => {
  it("名前を付け替える", () => {
    const s = must(setSegment(sample(), { id: "g-1", label: " 要件の整理 ", kind: "work" }));
    expect(shape(s)[0]).toBe("要件の整理:0-10");
  });
  it("計測中の区切りにも使える", () => {
    const s = must(setSegment(sample(), { id: "g-4", label: "レビュー", kind: "work" }));
    expect(shape(s).at(-1)).toBe("レビュー:50-");
  });
  it("作業を休憩へ変えると名前は空になる", () => {
    const s = must(setSegment(sample(), { id: "g-2", label: "実装", kind: "break" }));
    expect(s.segments[1]).toMatchObject({ kind: "break", label: "" });
  });
  it("休憩を作業へ変えると、渡した名前が付く", () => {
    const s = must(setSegment(sample(), { id: "g-3", label: "雑談", kind: "work" }));
    expect(s.segments[2]).toMatchObject({ kind: "work", label: "雑談" });
  });
  it("同じ名前・同じ種類なら何もしない（同じ参照）", () => {
    const s = sample();
    expect(must(setSegment(s, { id: "g-1", label: "設計", kind: "work" }))).toBe(s);
  });
  it("無い区切りは SEGMENT_NOT_FOUND", () => {
    expect(codeOf(setSegment(sample(), { id: "g-99", label: "x", kind: "work" }))).toBe("SEGMENT_NOT_FOUND");
  });
  it("長すぎる名前は TRACK_INVALID_LABEL", () => {
    expect(codeOf(setSegment(sample(), { id: "g-1", label: "あ".repeat(81), kind: "work" }))).toBe("TRACK_INVALID_LABEL");
  });
  it("手直しは取り消しの写しを捨て、問いかけを下ろす", () => {
    const base = autoStop(sample(), { at: at(55) });
    const s = must(setSegment(base, { id: "g-1", label: "別名", kind: "work" }));
    expect(s.undo).toBeNull();
    expect(s.resumeOffer).toBe(false);
    expect(s.rev).toBe(base.rev + 1);
  });
});

describe("adjustSegment（始まり・終わりの調整）", () => {
  it("接している境界は隣ごと動く（終わりを動かす）", () => {
    const s = must(adjustSegment(sample(), { id: "g-1", edge: "end", atMs: 12 * MIN, now: NOW }));
    expect(shape(s).slice(0, 2)).toEqual(["設計:0-12", "実装:12-30"]);
  });
  it("接している境界は隣ごと動く（始まりを動かす）", () => {
    const s = must(adjustSegment(sample(), { id: "g-2", edge: "start", atMs: 5 * MIN, now: NOW }));
    expect(shape(s).slice(0, 2)).toEqual(["設計:0-5", "実装:5-30"]);
  });
  it("隙間の側の端は、その端だけが動く", () => {
    const s = must(adjustSegment(sample(), { id: "g-3", edge: "end", atMs: 45 * MIN, now: NOW }));
    expect(shape(s).slice(2)).toEqual(["休憩:30-45", "実装:50-"]);
  });
  it("隙間を使い切る所までは動かせる（次の始まりちょうど）", () => {
    const s = must(adjustSegment(sample(), { id: "g-3", edge: "end", atMs: 50 * MIN, now: NOW }));
    expect(shape(s).slice(2)).toEqual(["休憩:30-50", "実装:50-"]);
  });
  it("隙間をはさんだ隣へ食い込む移動は TRACK_INVALID_RANGE", () => {
    expect(codeOf(adjustSegment(sample(), { id: "g-3", edge: "end", atMs: 50 * MIN + 1, now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(codeOf(adjustSegment(sample(), { id: "g-4", edge: "start", atMs: 40 * MIN - 1, now: NOW }))).toBe("TRACK_INVALID_RANGE");
  });
  it("隣の区切りが 1 秒を下回る移動は TRACK_INVALID_RANGE", () => {
    expect(codeOf(adjustSegment(sample(), { id: "g-1", edge: "end", atMs: 30 * MIN - MIN_SEGMENT_MS + 1, now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(must(adjustSegment(sample(), { id: "g-1", edge: "end", atMs: 30 * MIN - MIN_SEGMENT_MS, now: NOW })).segments[1]!.startMs).toBe(30 * MIN - MIN_SEGMENT_MS);
  });
  it("自分が 1 秒を下回る移動は TRACK_INVALID_RANGE", () => {
    expect(codeOf(adjustSegment(sample(), { id: "g-2", edge: "end", atMs: 10 * MIN + MIN_SEGMENT_MS - 1, now: NOW }))).toBe("TRACK_INVALID_RANGE");
  });
  it("計測中の区切りの終わりは動かせない（SEGMENT_RUNNING）", () => {
    expect(codeOf(adjustSegment(sample(), { id: "g-4", edge: "end", atMs: 55 * MIN, now: NOW }))).toBe("SEGMENT_RUNNING");
  });
  it("計測中の区切りの始まりは、いまの 1 秒前まで動かせる", () => {
    expect(must(adjustSegment(sample(), { id: "g-4", edge: "start", atMs: 60 * MIN - MIN_SEGMENT_MS, now: NOW })).segments[3]!.startMs).toBe(60 * MIN - MIN_SEGMENT_MS);
    expect(codeOf(adjustSegment(sample(), { id: "g-4", edge: "start", atMs: 60 * MIN, now: NOW }))).toBe("TRACK_INVALID_RANGE");
  });
  it("最初の区切りの始まりは、いまから 24 時間前まで動かせる", () => {
    const lowest = 60 * MIN - MAX_LOOKBACK_MS;
    expect(must(adjustSegment(sample(), { id: "g-1", edge: "start", atMs: lowest, now: NOW })).segments[0]!.startMs).toBe(lowest);
    expect(codeOf(adjustSegment(sample(), { id: "g-1", edge: "start", atMs: lowest - 1, now: NOW }))).toBe("TRACK_INVALID_RANGE");
  });
  it("最後の閉じた区切りの終わりは、いまを越えられない", () => {
    const stopped = must(stop(sample(), { now: at(55) }));
    expect(codeOf(adjustSegment(stopped, { id: "g-4", edge: "end", atMs: 60 * MIN + 1, now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(must(adjustSegment(stopped, { id: "g-4", edge: "end", atMs: 60 * MIN, now: NOW })).segments[3]!.endMs).toBe(60 * MIN);
  });
  it("同じ位置なら何もしない（同じ参照）", () => {
    const s = sample();
    expect(must(adjustSegment(s, { id: "g-1", edge: "end", atMs: 10 * MIN, now: NOW }))).toBe(s);
  });
  it("終わりを動かすと、全員の切断で閉じた印を外す", () => {
    const closed = autoStop(sample(), { at: at(55) });
    expect(closed.segments[3]!.autoClosed).toBe(true);
    const s = must(adjustSegment(closed, { id: "g-4", edge: "end", atMs: 58 * MIN, now: NOW }));
    expect(s.segments[3]!.autoClosed).toBe(false);
  });
  it("無い区切りは SEGMENT_NOT_FOUND", () => {
    expect(codeOf(adjustSegment(sample(), { id: "g-99", edge: "end", atMs: 1, now: NOW }))).toBe("SEGMENT_NOT_FOUND");
  });
});

describe("24 時間より前へは置けない（始まり以外の手直し）", () => {
  // 0〜2 時間の区切りを持ち、いまは 25 時間。置ける下限は 1 時間
  const HOUR = 60 * MIN;
  const old = (): TrackState => must(stop(must(start(empty(), { label: "古い作業", kind: "work", now: at(0) })), { now: at(120) }));
  const LATER = at(25 * 60);

  it("終わりを、下限より前へは動かせない", () => {
    expect(codeOf(adjustSegment(old(), { id: "g-1", edge: "end", atMs: HOUR - 1, now: LATER }))).toBe("TRACK_INVALID_RANGE");
    expect(must(adjustSegment(old(), { id: "g-1", edge: "end", atMs: HOUR, now: LATER })).segments[0]!.endMs).toBe(HOUR);
  });
  it("下限より前の位置では分けられない", () => {
    expect(codeOf(splitSegment(old(), { id: "g-1", atMs: HOUR - 1, label: "x", kind: "work", now: LATER }))).toBe("TRACK_INVALID_RANGE");
    expect(must(splitSegment(old(), { id: "g-1", atMs: HOUR, label: "x", kind: "work", now: LATER })).segments).toHaveLength(2);
  });
});

describe("adjustRangeOf（動かせる範囲）", () => {
  const view = toView(sample(), NOW);
  it("接している境界は、隣の反対の端の 1 秒内側まで", () => {
    expect(adjustRangeOf(view.segments, "g-1", "end", view.nowMs)).toEqual({ minMs: MIN_SEGMENT_MS, maxMs: 30 * MIN - MIN_SEGMENT_MS });
  });
  it("隙間の側の端は、隣の端まで", () => {
    expect(adjustRangeOf(view.segments, "g-3", "end", view.nowMs)).toEqual({ minMs: 30 * MIN + MIN_SEGMENT_MS, maxMs: 50 * MIN });
  });
  it("計測中の区切りの終わりと、無い区切りは null", () => {
    expect(adjustRangeOf(view.segments, "g-4", "end", view.nowMs)).toBeNull();
    expect(adjustRangeOf(view.segments, "g-99", "start", view.nowMs)).toBeNull();
  });
});

describe("splitSegment（分割）", () => {
  it("区切りを 2 つに分け、後半に名前と種類を付ける", () => {
    const s = must(splitSegment(sample(), { id: "g-2", atMs: 20 * MIN, label: "レビュー", kind: "work", now: NOW }));
    expect(shape(s).slice(0, 3)).toEqual(["設計:0-10", "実装:10-20", "レビュー:20-30"]);
    expect(s.segments[2]!.id).toBe("g-5");
  });
  it("計測中の区切りも分けられ、後半が計測中になる", () => {
    const s = must(splitSegment(sample(), { id: "g-4", atMs: 57 * MIN, label: "調べもの", kind: "work", now: NOW }));
    expect(shape(s).slice(3)).toEqual(["実装:50-57", "調べもの:57-"]);
  });
  it("前半か後半が 1 秒を下回る位置は TRACK_INVALID_RANGE", () => {
    expect(codeOf(splitSegment(sample(), { id: "g-2", atMs: 10 * MIN + 999, label: "x", kind: "work", now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(codeOf(splitSegment(sample(), { id: "g-2", atMs: 30 * MIN - 999, label: "x", kind: "work", now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(codeOf(splitSegment(sample(), { id: "g-4", atMs: 60 * MIN - 999, label: "x", kind: "work", now: NOW }))).toBe("TRACK_INVALID_RANGE");
  });
  it("全員の切断で閉じた印は後半が引き継ぐ", () => {
    const closed = autoStop(sample(), { at: at(58) });
    const s = must(splitSegment(closed, { id: "g-4", atMs: 54 * MIN, label: "後半", kind: "work", now: NOW }));
    expect(s.segments.slice(3).map((g) => g.autoClosed)).toEqual([false, true]);
  });
  it("上限のときは TRACK_FULL", () => {
    let s: TrackState = empty();
    for (let i = 0; i < MAX_SEGMENTS; i++) s = must(start(s, { label: `作業${i}`, kind: "work", now: at(i) }));
    expect(codeOf(splitSegment(s, { id: "g-1", atMs: 30_000, label: "x", kind: "work", now: at(MAX_SEGMENTS) }))).toBe("TRACK_FULL");
  });
  it("無い区切りは SEGMENT_NOT_FOUND", () => {
    expect(codeOf(splitSegment(sample(), { id: "g-99", atMs: 1, label: "x", kind: "work", now: NOW }))).toBe("SEGMENT_NOT_FOUND");
  });
});

describe("insertSegment（後からの追加・上書き）", () => {
  it("隙間に足す", () => {
    const s = must(insertSegment(sample(), { startMs: 42 * MIN, endMs: 48 * MIN, label: "雑談", kind: "work", now: NOW }));
    expect(shape(s).slice(2)).toEqual(["休憩:30-40", "雑談:42-48", "実装:50-"]);
  });
  it("区切りの途中に足すと、その区切りを前後に分ける", () => {
    const s = must(insertSegment(sample(), { startMs: 15 * MIN, endMs: 20 * MIN, label: "調べもの", kind: "work", now: NOW }));
    expect(shape(s).slice(1, 4)).toEqual(["実装:10-15", "調べもの:15-20", "実装:20-30"]);
    // 前の部分が元の番号を保ち、後ろの部分と足した区切りに新しい番号が付く
    expect(s.segments.slice(1, 4).map((g) => g.id)).toEqual(["g-2", "g-5", "g-6"]);
  });
  it("複数の区切りにまたがると、覆われた区切りは消え、端の区切りは削られる", () => {
    const s = must(insertSegment(sample(), { startMs: 5 * MIN, endMs: 35 * MIN, label: "まとめて", kind: "work", now: NOW }));
    expect(shape(s)).toEqual(["設計:0-5", "まとめて:5-35", "休憩:35-40", "実装:50-"]);
  });
  it("計測中の区切りの中にも置け、後ろの残りが計測中のまま続く", () => {
    const s = must(insertSegment(sample(), { startMs: 52 * MIN, endMs: 56 * MIN, label: "割り込み", kind: "work", now: NOW }));
    expect(shape(s).slice(3)).toEqual(["実装:50-52", "割り込み:52-56", "実装:56-"]);
  });
  it("1 秒に満たない端切れは、足した区切りへ含める（分単位の入力と ms の境界のずれ）", () => {
    // g-2 の終わりを 30 分 + 100ms へずらしておく（実際の境界は ms でずれる）
    const skewed = must(adjustSegment(sample(), { id: "g-2", edge: "end", atMs: 30 * MIN + 100, now: NOW }));
    const s = must(insertSegment(skewed, { startMs: 20 * MIN, endMs: 30 * MIN, label: "レビュー", kind: "work", now: NOW }));
    expect(s.segments.map((g) => [g.label, g.startMs, g.endMs])).toEqual([
      ["設計", 0, 10 * MIN],
      ["実装", 10 * MIN, 20 * MIN],
      ["レビュー", 20 * MIN, 30 * MIN + 100],
      ["", 30 * MIN + 100, 40 * MIN],
      ["実装", 50 * MIN, null],
    ]);
  });
  it("前の端切れも含める", () => {
    const s = must(insertSegment(sample(), { startMs: 10 * MIN + 500, endMs: 20 * MIN, label: "レビュー", kind: "work", now: NOW }));
    expect(shape(s).slice(0, 3)).toEqual(["設計:0-10", "レビュー:10-20", "実装:20-30"]);
  });
  it("空の記録にも足せる（基準より前の位置も置ける）", () => {
    const s = must(insertSegment(empty(), { startMs: -30 * MIN, endMs: -10 * MIN, label: "朝の準備", kind: "work", now: at(5) }));
    expect(shape(s)).toEqual(["朝の準備:-30--10"]);
  });
  it("いまより先・24 時間より前・1 秒未満の範囲は TRACK_INVALID_RANGE", () => {
    const base = sample();
    expect(codeOf(insertSegment(base, { startMs: 55 * MIN, endMs: 60 * MIN + 1, label: "x", kind: "work", now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(codeOf(insertSegment(base, { startMs: 60 * MIN - MAX_LOOKBACK_MS - 1, endMs: 0, label: "x", kind: "work", now: NOW }))).toBe("TRACK_INVALID_RANGE");
    expect(codeOf(insertSegment(base, { startMs: 42 * MIN, endMs: 42 * MIN + 999, label: "x", kind: "work", now: NOW }))).toBe("TRACK_INVALID_RANGE");
  });
  it("覆った区切りの印は消え、削っただけの後ろの区切りは印を保つ", () => {
    const closed = autoStop(sample(), { at: at(58) });
    const trimmed = must(insertSegment(closed, { startMs: 45 * MIN, endMs: 52 * MIN, label: "x", kind: "work", now: NOW }));
    expect(trimmed.segments.at(-1)).toMatchObject({ startMs: 52 * MIN, endMs: 58 * MIN, autoClosed: true });
    const cut = must(insertSegment(closed, { startMs: 55 * MIN, endMs: 59 * MIN, label: "x", kind: "work", now: NOW }));
    expect(cut.segments.map((g) => g.autoClosed)).toEqual([false, false, false, false, false]);
  });
  it("結果が上限を超えるときは TRACK_FULL", () => {
    let s: TrackState = empty();
    for (let i = 0; i < MAX_SEGMENTS; i++) s = must(start(s, { label: `作業${i}`, kind: "work", now: at(i) }));
    expect(codeOf(insertSegment(s, { startMs: 10_000, endMs: 20_000, label: "x", kind: "work", now: at(MAX_SEGMENTS) }))).toBe("TRACK_FULL");
  });
  it("上限のときでも、区切りを覆って数が増えない追加は通る", () => {
    let s: TrackState = empty();
    for (let i = 0; i < MAX_SEGMENTS; i++) s = must(start(s, { label: `作業${i}`, kind: "work", now: at(i) }));
    const merged = must(insertSegment(s, { startMs: 0, endMs: 2 * MIN, label: "まとめ", kind: "work", now: at(MAX_SEGMENTS) }));
    expect(merged.segments).toHaveLength(MAX_SEGMENTS - 1);
  });
  it("休憩として足すと名前は空になる", () => {
    const s = must(insertSegment(sample(), { startMs: 42 * MIN, endMs: 48 * MIN, label: "お昼", kind: "break", now: NOW }));
    expect(s.segments[3]).toMatchObject({ kind: "break", label: "" });
  });
});

describe("removeSegment（区切りを消す）", () => {
  it("閉じた区切りを消すと、その時間は隙間になる", () => {
    const s = must(removeSegment(sample(), { id: "g-2" }));
    expect(shape(s)).toEqual(["設計:0-10", "休憩:30-40", "実装:50-"]);
  });
  it("計測中の区切りは SEGMENT_RUNNING", () => {
    expect(codeOf(removeSegment(sample(), { id: "g-4" }))).toBe("SEGMENT_RUNNING");
  });
  it("無い区切りは SEGMENT_NOT_FOUND", () => {
    expect(codeOf(removeSegment(sample(), { id: "g-99" }))).toBe("SEGMENT_NOT_FOUND");
  });
});

describe("away（離れていた間を休憩にする・FR-27）", () => {
  /** sample() の計測中は g-4 実装 50-。NOW = 60 分 */
  it("指した位置からいままでを休憩で上書きし、計測中の区切りは後ろで同じ名前のまま続く", () => {
    const s = must(away(sample(), { fromMs: 52 * MIN, now: NOW }));
    expect(shape(s).slice(3)).toEqual(["実装:50-52", "休憩:52-60", "実装:60-"]);
    expect(s.segments.at(-1)).toMatchObject({ kind: "work", label: "実装", endMs: null });
  });
  it("取り消しの対象（kind は away）で、取り消すと直前の区切りの列へ戻る", () => {
    const base = sample();
    const s = must(away(base, { fromMs: 52 * MIN, now: NOW }));
    expect(s.undo!.kind).toBe("away");
    expect(s.rev).toBe(base.rev + 1);
    const undone = undo(s, { rev: s.undo!.rev, now: NOW + 1 });
    expect(undone.segments).toEqual(base.segments);
  });
  it("前の端切れ（1 秒未満）は休憩へ含める", () => {
    const s = must(away(sample(), { fromMs: 50 * MIN + 500, now: NOW }));
    expect(shape(s).slice(3)).toEqual(["休憩:50-60", "実装:60-"]);
  });
  it("計測していなければ何もしない（同じ参照）", () => {
    const stopped = must(stop(sample(), { now: NOW }));
    expect(must(away(stopped, { fromMs: 52 * MIN, now: NOW + MIN }))).toBe(stopped);
    const e = empty();
    expect(must(away(e, { fromMs: 0, now: at(5) }))).toBe(e);
  });
  it("計測中の区切りの始まり以前は TRACK_BACKDATE_TOO_FAR", () => {
    expect(codeOf(away(sample(), { fromMs: 50 * MIN, now: NOW }))).toBe("TRACK_BACKDATE_TOO_FAR");
    expect(codeOf(away(sample(), { fromMs: 45 * MIN, now: NOW }))).toBe("TRACK_BACKDATE_TOO_FAR");
  });
  it("いまより先・いまちょうど・いまとの差が 1 秒未満は TRACK_BACKDATE_TOO_FAR", () => {
    expect(codeOf(away(sample(), { fromMs: 61 * MIN, now: NOW }))).toBe("TRACK_BACKDATE_TOO_FAR");
    expect(codeOf(away(sample(), { fromMs: 60 * MIN, now: NOW }))).toBe("TRACK_BACKDATE_TOO_FAR");
    expect(codeOf(away(sample(), { fromMs: 60 * MIN - MIN_SEGMENT_MS + 1, now: NOW }))).toBe("TRACK_BACKDATE_TOO_FAR");
    const edge = must(away(sample(), { fromMs: 60 * MIN - MIN_SEGMENT_MS, now: NOW }));
    expect(edge.segments.slice(3).map((g) => [g.kind, g.startMs, g.endMs])).toEqual([
      ["work", 50 * MIN, 60 * MIN - MIN_SEGMENT_MS],
      ["break", 60 * MIN - MIN_SEGMENT_MS, 60 * MIN],
      ["work", 60 * MIN, null],
    ]);
  });
  it("いまから 24 時間より前は TRACK_BACKDATE_TOO_FAR（ちょうど 24 時間前は通る）", () => {
    const longRunning = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    const now = at(30 * 60);
    expect(codeOf(away(longRunning, { fromMs: 6 * 60 * MIN - 1, now }))).toBe("TRACK_BACKDATE_TOO_FAR");
    expect(away(longRunning, { fromMs: 6 * 60 * MIN, now }).isOk()).toBe(true);
  });
  it("区切りが上限に達していれば TRACK_FULL", () => {
    let s = must(start(empty(), { label: "a", kind: "work", now: at(0) }));
    for (let i = 1; i < MAX_SEGMENTS; i++) s = must(start(s, { label: i % 2 === 0 ? "a" : "b", kind: "work", now: at(i * 2) }));
    expect(s.segments).toHaveLength(MAX_SEGMENTS);
    expect(codeOf(away(s, { fromMs: MAX_SEGMENTS * 2 * MIN - MIN, now: at(MAX_SEGMENTS * 2) + 5 * MIN }))).toBe("TRACK_FULL");
  });
  it("離れていた間に重なる閉じた区切りはないので、休憩の前の区切りには触らない", () => {
    const s = must(away(sample(), { fromMs: 55 * MIN, now: NOW }));
    expect(s.segments.slice(0, 3)).toEqual(sample().segments.slice(0, 3));
  });
});
