import { describe, expect, it } from "vitest";
import { LONG_RUNNING_NOTICE_MS, MAX_CANDIDATES, MAX_LABEL } from "../src/limits.js";
import { advanceNow, candidatesOf, longRunningOf, previousLabelOf, runningSegmentOf, totalsOf } from "../src/projection.js";
import { pin, start, stop, toView } from "../src/track.js";
import type { TrackState, TrackView } from "../src/types.js";
import { MIN, at, empty, must, sample } from "./support/states.js";

/** sample(): 設計 0-10・実装 10-30・休憩 30-40・（隙間）・実装 50-（計測中） */
const viewAt = (minutes: number, s: TrackState = sample()): TrackView => toView(s, at(minutes));
/** sample() の計測中を止めたもの（候補が計測中の名前を外す規則に当たらない形） */
const stoppedSample = (): TrackState => must(stop(sample(), { now: at(55) }));

describe("advanceNow", () => {
  it("受け取ってからの経過を、送る時点の位置に足す", () => {
    expect(advanceNow(viewAt(55), 2500)).toBe(55 * MIN + 2500);
  });
  it("負の経過は足さない（時計が戻っても位置を戻さない）", () => {
    expect(advanceNow(viewAt(55), -10)).toBe(55 * MIN);
  });
});

describe("totalsOf", () => {
  it("作業名ごとの合計を降順に並べ、計測中の分はいまの位置まで数える", () => {
    const view = viewAt(60);
    const totals = totalsOf(view, view.nowMs);
    expect(totals.rows.map((r) => [r.label, r.ms])).toEqual([
      ["実装", 30 * MIN],
      ["設計", 10 * MIN],
    ]);
  });
  it("休憩は作業名ごとの合計と割合から外し、別に数える", () => {
    const view = viewAt(60);
    const totals = totalsOf(view, view.nowMs);
    expect(totals.workMs).toBe(40 * MIN);
    expect(totals.breakMs).toBe(10 * MIN);
    expect(totals.totalMs).toBe(50 * MIN);
    expect(totals.rows.map((r) => r.ratio)).toEqual([0.75, 0.25]);
  });
  it("隙間（止めていた時間）はどの合計にも入らない", () => {
    const view = viewAt(60);
    // 0〜60 分のうち 40〜50 分は隙間
    expect(totalsOf(view, view.nowMs).totalMs).toBe(60 * MIN - 10 * MIN);
  });
  it("名前なしは 1 行にまとめる", () => {
    let s = must(start(empty(), { label: "", kind: "work", now: at(0) }));
    s = must(start(s, { label: "実装", kind: "work", now: at(5) }));
    s = must(start(s, { label: "", kind: "work", now: at(6) }));
    const view = toView(s, at(10));
    expect(totalsOf(view, view.nowMs).rows.map((r) => [r.label, r.ms])).toEqual([
      ["", 9 * MIN],
      ["実装", 1 * MIN],
    ]);
  });
  it("同じ合計なら、先に現れた作業名を先に並べる", () => {
    let s = must(start(empty(), { label: "B", kind: "work", now: at(0) }));
    s = must(start(s, { label: "A", kind: "work", now: at(5) }));
    s = must(stop(s, { now: at(10) }));
    const view = toView(s, at(10));
    expect(totalsOf(view, view.nowMs).rows.map((r) => r.label)).toEqual(["B", "A"]);
  });
  it("作業が無ければ割合は 0（0 で割らない）", () => {
    const s = must(start(empty(), { label: "", kind: "break", now: at(0) }));
    const view = toView(s, at(5));
    const totals = totalsOf(view, view.nowMs);
    expect(totals.rows).toEqual([]);
    expect(totals.workMs).toBe(0);
    expect(totals.breakMs).toBe(5 * MIN);
  });
  it("空の記録は、すべて 0", () => {
    const view = toView(empty(), at(5));
    expect(totalsOf(view, view.nowMs)).toEqual({ rows: [], workMs: 0, breakMs: 0, totalMs: 0 });
  });
});

describe("runningSegmentOf", () => {
  it("計測中の区切りを返し、止まっていれば null", () => {
    expect(runningSegmentOf(viewAt(55))?.id).toBe("g-4");
    expect(runningSegmentOf(toView(must(stop(sample(), { now: at(55) })), at(56)))).toBeNull();
  });
});

describe("candidatesOf", () => {
  it("お題・定番・最近使った作業名の順に、重複を除いて並べる", () => {
    let s = must(pin(stoppedSample(), { label: "レビュー", pinned: true }));
    s = must(pin(s, { label: "実装", pinned: true }));
    expect(candidatesOf(toView(s, at(55)), "FizzBuzz")).toEqual([
      { label: "FizzBuzz", source: "topic", pinned: false },
      { label: "レビュー", source: "pinned", pinned: true },
      { label: "実装", source: "pinned", pinned: true },
      { label: "設計", source: "recent", pinned: false },
    ]);
  });
  it("最近使った作業名は新しい順で、名前なしと休憩は入れない", () => {
    let s = must(start(sample(), { label: "", kind: "work", now: at(52) }));
    s = must(start(s, { label: "調べもの", kind: "work", now: at(54) }));
    s = must(stop(s, { now: at(55) }));
    expect(candidatesOf(toView(s, at(55)), null).map((c) => c.label)).toEqual(["調べもの", "実装", "設計"]);
  });
  it("お題が定番にもあれば、お題の位置に定番の印つきで 1 度だけ出す", () => {
    const s = must(pin(stoppedSample(), { label: "実装", pinned: true }));
    expect(candidatesOf(toView(s, at(55)), " 実装 ")).toEqual([
      { label: "実装", source: "topic", pinned: true },
      { label: "設計", source: "recent", pinned: false },
    ]);
  });
  it("長いお題は作業名の上限で切り詰める（サロゲートを割らない）", () => {
    const title = "あ".repeat(MAX_LABEL - 1) + "🎉🎉";
    const [first] = candidatesOf(viewAt(55), title);
    expect(first!.label).toBe("あ".repeat(MAX_LABEL - 1));
    expect(candidatesOf(viewAt(55), "い".repeat(200))[0]!.label).toBe("い".repeat(MAX_LABEL));
  });
  it("制御文字を含む・空になるお題は候補にしない", () => {
    expect(candidatesOf(viewAt(55), "a\nb").map((c) => c.source)).not.toContain("topic");
    expect(candidatesOf(viewAt(55), "  ").map((c) => c.source)).not.toContain("topic");
  });
  it("候補は上限の数まで", () => {
    let s = empty();
    for (let i = 0; i < 12; i++) s = must(start(s, { label: `作業${i}`, kind: "work", now: at(i) }));
    const list = candidatesOf(toView(s, at(20)), "お題");
    expect(list).toHaveLength(MAX_CANDIDATES);
    expect(list[0]!.label).toBe("お題");
    // 作業11 は計測中なので外れる
    expect(list[1]!.label).toBe("作業10");
  });
  it("計測中の区切りと同じ名前は、お題・定番・最近のどれからも外す", () => {
    const s = must(pin(sample(), { label: "実装", pinned: true }));
    expect(candidatesOf(toView(s, at(55)), "実装")).toEqual([{ label: "設計", source: "recent", pinned: false }]);
  });
  it("外した後の並びが候補の並び（数字キーの対応）になる", () => {
    let s = must(pin(sample(), { label: "実装", pinned: true }));
    s = must(pin(s, { label: "レビュー", pinned: true }));
    expect(candidatesOf(toView(s, at(55)), "お題").map((c) => c.label)).toEqual(["お題", "レビュー", "設計"]);
  });
  it("計測中が休憩・名前なしなら、何も外さない", () => {
    const s = must(start(stoppedSample(), { label: "", kind: "break", now: at(56) }));
    expect(candidatesOf(toView(s, at(57)), null).map((c) => c.label)).toEqual(["実装", "設計"]);
  });
  it("止まっているときは、最後の作業名も候補に残る", () => {
    expect(candidatesOf(toView(stoppedSample(), at(56)), null).map((c) => c.label)).toEqual(["実装", "設計"]);
  });
  it("お題の見えない字は落として候補にする（作業名と同じ正規化を通る）", () => {
    expect(candidatesOf(viewAt(55), "Fizz\u200bBuzz")[0]).toEqual({ label: "FizzBuzz", source: "topic", pinned: false });
    expect(candidatesOf(viewAt(55), "\u200b\u202e").map((c) => c.source)).not.toContain("topic");
  });
});

describe("previousLabelOf（C キー）", () => {
  it("計測中は、いまの区切りと違う名前のうち最も新しい作業を返す", () => {
    expect(previousLabelOf(viewAt(55))).toBe("設計");
  });
  it("休憩・名前なしを計測中なら、最も新しい名前のある作業を返す", () => {
    const s = must(start(sample(), { label: "", kind: "break", now: at(52) }));
    expect(previousLabelOf(toView(s, at(55)))).toBe("実装");
  });
  it("止まっているときは、最後の名前のある作業を返す", () => {
    const s = must(stop(sample(), { now: at(55) }));
    expect(previousLabelOf(toView(s, at(56)))).toBe("実装");
  });
  it("該当が無ければ null", () => {
    expect(previousLabelOf(toView(empty(), at(1)))).toBeNull();
    const only = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    expect(previousLabelOf(toView(only, at(1)))).toBeNull();
  });
});

describe("longRunningOf（止め忘れの知らせ）", () => {
  it("計測中の区切りが 90 分に達したら、その区切りを返す", () => {
    const s = must(start(empty(), { label: "実装", kind: "work", now: at(0) }));
    const view = toView(s, at(0));
    expect(longRunningOf(view, LONG_RUNNING_NOTICE_MS - 1)).toBeNull();
    expect(longRunningOf(view, LONG_RUNNING_NOTICE_MS)?.id).toBe("g-1");
  });
  it("止まっていれば null", () => {
    const s = must(stop(must(start(empty(), { label: "実装", kind: "work", now: at(0) })), { now: at(100) }));
    expect(longRunningOf(toView(s, at(200)), 200 * MIN)).toBeNull();
  });
});
