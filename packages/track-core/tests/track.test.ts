import { describe, expect, it } from "vitest";
import { MAX_PINNED, MAX_SEGMENTS, UNDO_WINDOW_MS } from "../src/limits.js";
import { autoStop, clear, createTrackState, dismissOffer, pin, start, stop, toView, undo } from "../src/track.js";
import type { TrackState } from "../src/types.js";
import { EPOCH, MIN, WALL, at, codeOf, empty, must, sample, shape } from "./support/states.js";

describe("createTrackState", () => {
  it("空の記録と時刻軸の基準を持つ", () => {
    const s = createTrackState({ mono: EPOCH, wallMs: WALL });
    expect(s.segments).toEqual([]);
    expect(s.epochMono).toBe(EPOCH);
    expect(s.epochWallMs).toBe(WALL);
    expect(s.rev).toBe(0);
    expect(s.undo).toBeNull();
    expect(s.resumeOffer).toBe(false);
  });
});

describe("start（開始）", () => {
  it("計測していなければ、いまの位置から新しい区切りを始める", () => {
    const s = must(start(empty(), { label: "設計", kind: "work", now: at(3) }));
    expect(shape(s)).toEqual(["設計:3-"]);
    expect(s.segments[0]!.id).toBe("g-1");
    expect(s.rev).toBe(1);
  });
  it("作業名が空なら名前なしで始める", () => {
    const s = must(start(empty(), { label: "  ", kind: "work", now: at(0) }));
    expect(s.segments[0]!.label).toBe("");
  });
  it("作業名は正規化して持つ", () => {
    const s = must(start(empty(), { label: " ＡＰＩ設計 ", kind: "work", now: at(0) }));
    expect(s.segments[0]!.label).toBe("API設計");
  });
  it("休憩は作業名を受けても空で持つ", () => {
    const s = must(start(empty(), { label: "お昼", kind: "break", now: at(0) }));
    expect(s.segments[0]).toMatchObject({ kind: "break", label: "" });
  });
  it("長すぎる作業名は TRACK_INVALID_LABEL", () => {
    expect(codeOf(start(empty(), { label: "あ".repeat(81), kind: "work", now: at(0) }))).toBe("TRACK_INVALID_LABEL");
  });
  it("制御文字を含む作業名は TRACK_INVALID_LABEL", () => {
    expect(codeOf(start(empty(), { label: "a\nb", kind: "work", now: at(0) }))).toBe("TRACK_INVALID_LABEL");
  });
  it("さかのぼって始められる", () => {
    const s = must(start(empty(), { label: "設計", kind: "work", backMin: 5, now: at(20) }));
    expect(shape(s)).toEqual(["設計:15-"]);
  });
  it("止まっているとき、直前の区切りの終わりより前へはさかのぼれない", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(stop(s, { now: at(10) }));
    expect(codeOf(start(s, { label: "実装", kind: "work", backMin: 5, now: at(12) }))).toBe("TRACK_BACKDATE_TOO_FAR");
  });
  it("止まっているとき、直前の区切りの終わりちょうどまではさかのぼれる", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(stop(s, { now: at(10) }));
    s = must(start(s, { label: "実装", kind: "work", backMin: 5, now: at(15) }));
    expect(shape(s)).toEqual(["設計:0-10", "実装:10-"]);
  });
  it("区切りが上限に達していたら TRACK_FULL", () => {
    let s = empty();
    for (let i = 0; i < MAX_SEGMENTS; i++) s = must(start(s, { label: `作業${i}`, kind: "work", now: at(i) }));
    expect(s.segments).toHaveLength(MAX_SEGMENTS);
    expect(codeOf(start(s, { label: "あふれ", kind: "work", now: at(MAX_SEGMENTS) }))).toBe("TRACK_FULL");
  });
});

describe("start（切り替え）", () => {
  it("計測中の区切りをその位置で閉じ、同じ位置から次を始める", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(start(s, { label: "実装", kind: "work", now: at(10) }));
    expect(shape(s)).toEqual(["設計:0-10", "実装:10-"]);
    expect(s.segments.map((g) => g.id)).toEqual(["g-1", "g-2"]);
  });
  it("同じ作業名・同じ種類なら何もしない（同じ参照）", () => {
    const s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    expect(must(start(s, { label: " 設計 ", kind: "work", now: at(5) }))).toBe(s);
  });
  it("同じ作業名なら、さかのぼりが付いていても何もしない", () => {
    const s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    expect(must(start(s, { label: "設計", kind: "work", backMin: 1, now: at(5) }))).toBe(s);
  });
  it("休憩中に休憩を押しても何もしない", () => {
    const s = must(start(empty(), { label: "", kind: "break", now: at(0) }));
    expect(must(start(s, { label: "", kind: "break", now: at(5) }))).toBe(s);
  });
  it("さかのぼって切り替えると、境界がその分だけ前になる", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(start(s, { label: "実装", kind: "work", backMin: 5, now: at(20) }));
    expect(shape(s)).toEqual(["設計:0-15", "実装:15-"]);
  });
  it("計測中の区切りの始まりを越えるさかのぼりは TRACK_BACKDATE_TOO_FAR", () => {
    const s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    expect(codeOf(start(s, { label: "実装", kind: "work", backMin: 5, now: at(5) }))).toBe("TRACK_BACKDATE_TOO_FAR");
    expect(codeOf(start(s, { label: "実装", kind: "work", backMin: 5, now: at(3) }))).toBe("TRACK_BACKDATE_TOO_FAR");
  });
  it("1 秒に満たない区切りは残さず、付け替えになる（候補の連打）", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(start(s, { label: "実装", kind: "work", now: at(10) }));
    s = must(start(s, { label: "調べもの", kind: "work", now: at(10) + 999 }));
    expect(shape(s)).toEqual(["設計:0-10", "調べもの:10-"]);
  });
  it("ちょうど 1 秒の区切りは残す", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(start(s, { label: "実装", kind: "work", now: at(0) + 1000 }));
    expect(s.segments).toHaveLength(2);
  });
  it("上限のとき、付け替えになる切り替えは通る（数が増えない）", () => {
    let s = empty();
    for (let i = 0; i < MAX_SEGMENTS; i++) s = must(start(s, { label: `作業${i}`, kind: "work", now: at(i) }));
    const replaced = must(start(s, { label: "付け替え", kind: "work", now: at(MAX_SEGMENTS - 1) + 500 }));
    expect(replaced.segments).toHaveLength(MAX_SEGMENTS);
    expect(replaced.segments.at(-1)!.label).toBe("付け替え");
  });
  it("開始・切り替えは問いかけを下ろす", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = autoStop(s, { at: at(10) });
    expect(s.resumeOffer).toBe(true);
    s = must(start(s, { label: "設計", kind: "work", now: at(30) }));
    expect(s.resumeOffer).toBe(false);
  });
});

describe("stop（停止）", () => {
  it("計測中の区切りを閉じる", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(stop(s, { now: at(7) }));
    expect(shape(s)).toEqual(["設計:0-7"]);
  });
  it("計測していなければ何もしない（同じ参照）", () => {
    const s = empty();
    expect(must(stop(s, { now: at(1) }))).toBe(s);
  });
  it("さかのぼって止められる", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(stop(s, { backMin: 10, now: at(30) }));
    expect(shape(s)).toEqual(["設計:0-20"]);
  });
  it("始まりを越えるさかのぼりは TRACK_BACKDATE_TOO_FAR", () => {
    const s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    expect(codeOf(stop(s, { backMin: 10, now: at(10) }))).toBe("TRACK_BACKDATE_TOO_FAR");
  });
  it("1 秒に満たない区切りは、止めると無かったことになる", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = must(stop(s, { now: at(0) + 500 }));
    expect(s.segments).toEqual([]);
  });
});

describe("undo（取り消し）", () => {
  const switched = (): { before: TrackState; after: TrackState } => {
    const before = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    return { before, after: must(start(before, { label: "実装", kind: "work", now: at(10) })) };
  };

  it("切り替えを取り消すと、前の区切りが閉じなかったものとして計測中へ戻る", () => {
    const { before, after } = switched();
    const s = undo(after, { rev: after.undo!.rev, now: at(10) + 3000 });
    expect(s.segments).toEqual(before.segments);
    expect(shape(s)).toEqual(["設計:0-"]);
    expect(s.undo).toBeNull();
    expect(s.rev).toBe(after.rev + 1);
  });
  it("番号が違えば何もしない（古い画面の取り消し）", () => {
    const { after } = switched();
    expect(undo(after, { rev: after.undo!.rev - 1, now: at(10) + 1 })).toBe(after);
  });
  it("期限ちょうどでは取り消せない", () => {
    const { after } = switched();
    expect(undo(after, { rev: after.undo!.rev, now: at(10) + UNDO_WINDOW_MS })).toBe(after);
    expect(undo(after, { rev: after.undo!.rev, now: at(10) + UNDO_WINDOW_MS - 1 })).not.toBe(after);
  });
  it("取り消した区切りの番号は使い回さない", () => {
    const { after } = switched();
    let s = undo(after, { rev: after.undo!.rev, now: at(10) + 1 });
    s = must(start(s, { label: "別の作業", kind: "work", now: at(12) }));
    expect(s.segments.map((g) => g.id)).toEqual(["g-1", "g-3"]);
  });
  it("停止を取り消すと計測中へ戻る", () => {
    const running = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    const stopped = must(stop(running, { now: at(5) }));
    expect(stopped.undo!.kind).toBe("stop");
    expect(shape(undo(stopped, { rev: stopped.undo!.rev, now: at(5) + 1 }))).toEqual(["設計:0-"]);
  });
  it("消した記録を取り消しで戻せる", () => {
    const s = sample();
    const cleared = clear(s, at(60));
    expect(cleared.segments).toEqual([]);
    expect(cleared.undo!.kind).toBe("clear");
    expect(undo(cleared, { rev: cleared.undo!.rev, now: at(60) + 1 }).segments).toEqual(s.segments);
  });
  it("取り消しても定番は戻らない", () => {
    const { after } = switched();
    const pinned = must(pin(after, { label: "実装", pinned: true }));
    expect(pinned.undo).toEqual(after.undo);
    const s = undo(pinned, { rev: pinned.undo!.rev, now: at(10) + 1 });
    expect(s.pinned).toEqual(["実装"]);
  });
  it("直前の 1 操作だけを覚える（次の操作で写しが入れ替わる）", () => {
    const { after } = switched();
    const next = must(start(after, { label: "調べもの", kind: "work", now: at(12) }));
    expect(undo(next, { rev: after.undo!.rev, now: at(12) + 1 })).toBe(next);
    expect(shape(undo(next, { rev: next.undo!.rev, now: at(12) + 1 }))).toEqual(["設計:0-10", "実装:10-"]);
  });
});

describe("autoStop（全員の切断）", () => {
  it("計測中の区切りを覚えた時刻で閉じ、印と問いかけを立てる", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = autoStop(s, { at: at(8) });
    expect(shape(s)).toEqual(["設計:0-8"]);
    expect(s.segments[0]!.autoClosed).toBe(true);
    expect(s.resumeOffer).toBe(true);
    expect(s.undo).toBeNull();
  });
  it("計測していなければ何もしない（同じ参照）", () => {
    const s = empty();
    expect(autoStop(s, { at: at(1) })).toBe(s);
  });
  it("1 秒に満たない区切りは捨て、問いかけも立てない", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = autoStop(s, { at: at(0) + 300 });
    expect(s.segments).toEqual([]);
    expect(s.resumeOffer).toBe(false);
  });
});

describe("dismissOffer", () => {
  it("問いかけを下ろす", () => {
    let s = must(start(empty(), { label: "設計", kind: "work", now: at(0) }));
    s = autoStop(s, { at: at(8) });
    const dismissed = dismissOffer(s);
    expect(dismissed.resumeOffer).toBe(false);
    expect(dismissed.rev).toBe(s.rev + 1);
    // 印は記録として残す
    expect(dismissed.segments[0]!.autoClosed).toBe(true);
  });
  it("問いかけが無ければ何もしない（同じ参照）", () => {
    const s = empty();
    expect(dismissOffer(s)).toBe(s);
  });
});

describe("clear（記録を消す）", () => {
  it("区切りを消し、定番と時刻軸の基準は残す", () => {
    const s = must(pin(sample(), { label: "実装", pinned: true }));
    const cleared = clear(s, at(60));
    expect(cleared.segments).toEqual([]);
    expect(cleared.pinned).toEqual(["実装"]);
    expect(cleared.epochMono).toBe(s.epochMono);
    expect(cleared.epochWallMs).toBe(s.epochWallMs);
  });
  it("記録が空なら何もしない（同じ参照）", () => {
    const s = empty();
    expect(clear(s, at(1))).toBe(s);
  });
});

describe("pin（定番）", () => {
  it("固定する・外す", () => {
    let s = must(pin(empty(), { label: " 実装 ", pinned: true }));
    expect(s.pinned).toEqual(["実装"]);
    s = must(pin(s, { label: "実装", pinned: false }));
    expect(s.pinned).toEqual([]);
  });
  it("固定済みをもう一度固定しても何もしない（同じ参照）", () => {
    const s = must(pin(empty(), { label: "実装", pinned: true }));
    expect(must(pin(s, { label: "実装", pinned: true }))).toBe(s);
  });
  it("固定していない名前を外しても何もしない（同じ参照）", () => {
    const s = empty();
    expect(must(pin(s, { label: "実装", pinned: false }))).toBe(s);
  });
  it("名前なしは固定できない", () => {
    expect(codeOf(pin(empty(), { label: " ", pinned: true }))).toBe("TRACK_INVALID_LABEL");
  });
  it("上限を超えたら PIN_LIMIT", () => {
    let s = empty();
    for (let i = 0; i < MAX_PINNED; i++) s = must(pin(s, { label: `定番${i}`, pinned: true }));
    expect(codeOf(pin(s, { label: "あふれ", pinned: true }))).toBe("PIN_LIMIT");
  });
});

describe("toView", () => {
  it("送る時点の時刻軸の位置を載せ、単調時計の値は載せない", () => {
    const s = sample();
    const view = toView(s, at(55));
    expect(view.nowMs).toBe(55 * MIN);
    expect(view.epochWallMs).toBe(WALL);
    expect(view.segments).toEqual(s.segments);
    expect(JSON.stringify(view)).not.toContain(String(EPOCH));
    expect(Object.keys(view).sort()).toEqual(["epochWallMs", "nowMs", "pinned", "resumeOffer", "rev", "segments", "undo"]);
  });
  it("取り消しの残り時間を、送る時点で計って載せる", () => {
    const s = sample(); // 最後の操作は at(50) の開始
    expect(toView(s, at(50) + 4000).undo).toEqual({ rev: s.undo!.rev, kind: "start", remainingMs: UNDO_WINDOW_MS - 4000 });
  });
  it("期限を過ぎた取り消しは載せない", () => {
    expect(toView(sample(), at(50) + UNDO_WINDOW_MS).undo).toBeNull();
  });
});
