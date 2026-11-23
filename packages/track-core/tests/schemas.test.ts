import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { MAX_LABEL_INPUT, TRACK_ERROR_CODES, TrackCommandSchema, TrackErrorFrameSchema, TrackFrameSchema, toView } from "../src/index.js";
import { at, sample } from "./support/states.js";

const ok = (schema: Parameters<typeof v.safeParse>[0], x: unknown): boolean => v.safeParse(schema, x).success;

describe("TrackCommandSchema", () => {
  const valid: unknown[] = [
    { command: "track.start", label: "実装", kind: "work" },
    { command: "track.start", label: "", kind: "work" },
    { command: "track.start", label: "", kind: "break", backMin: 5 },
    { command: "track.stop" },
    { command: "track.stop", backMin: 15 },
    { command: "track.undo", rev: 3 },
    { command: "track.segment.set", id: "g-1", label: "設計", kind: "work" },
    { command: "track.segment.adjust", id: "g-1", edge: "start", atMs: -60_000 },
    { command: "track.segment.adjust", id: "g-1", edge: "end", atMs: 120_000 },
    { command: "track.segment.split", id: "g-1", atMs: 60_000, label: "後半", kind: "work" },
    { command: "track.segment.insert", startMs: 0, endMs: 60_000, label: "", kind: "break" },
    { command: "track.segment.remove", id: "g-1" },
    { command: "track.pin", label: "実装", pinned: true },
    { command: "track.offer.dismiss" },
    { command: "track.clear" },
    { command: "track.sync" },
  ];
  it.each(valid.map((x) => [(x as { command: string }).command, x]))("通る: %s", (_name, x) => {
    expect(ok(TrackCommandSchema, x)).toBe(true);
  });

  it.each([
    ["知らないコマンド", { command: "track.unknown" }],
    ["余計な項目（誰が押したか）", { command: "track.stop", by: "p-1" }],
    ["余計な項目（開始）", { command: "track.start", label: "a", kind: "work", participantId: "p-1" }],
    ["種類が無い", { command: "track.start", label: "a" }],
    ["知らない種類", { command: "track.start", label: "a", kind: "pause" }],
    ["刻みに無いさかのぼり", { command: "track.start", label: "a", kind: "work", backMin: 3 }],
    ["さかのぼりが 0", { command: "track.stop", backMin: 0 }],
    ["作業名が文字列でない", { command: "track.start", label: 1, kind: "work" }],
    ["作業名が長すぎる", { command: "track.start", label: "あ".repeat(MAX_LABEL_INPUT + 1), kind: "work" }],
    ["作業名に制御文字", { command: "track.start", label: "a\nb", kind: "work" }],
    ["位置が小数", { command: "track.segment.adjust", id: "g-1", edge: "end", atMs: 1.5 }],
    ["位置が桁外れ", { command: "track.segment.adjust", id: "g-1", edge: "end", atMs: 1e15 }],
    ["位置が NaN", { command: "track.segment.insert", startMs: Number.NaN, endMs: 1, label: "", kind: "work" }],
    ["端が知らない値", { command: "track.segment.adjust", id: "g-1", edge: "middle", atMs: 1 }],
    ["区切りの番号が空", { command: "track.segment.remove", id: "" }],
    ["区切りの番号が長すぎる", { command: "track.segment.remove", id: "g".repeat(17) }],
    ["取り消しの番号が負", { command: "track.undo", rev: -1 }],
    ["定番の印が無い", { command: "track.pin", label: "a" }],
  ])("拒む: %s", (_name, x) => {
    expect(ok(TrackCommandSchema, x)).toBe(false);
  });

  it("作業名の上限ちょうど（正規化の前の長さ）は通す", () => {
    expect(ok(TrackCommandSchema, { command: "track.start", label: "あ".repeat(MAX_LABEL_INPUT), kind: "work" })).toBe(true);
  });
});

describe("TrackFrameSchema", () => {
  const frame = (state: Record<string, unknown>): unknown => ({ type: "track", state });
  const base = { epochWallMs: 1, nowMs: 2, segments: [], rev: 0 };

  it("サーバーの写しをそのまま受ける", () => {
    const view = toView(sample(), at(51));
    const parsed = v.parse(TrackFrameSchema, JSON.parse(JSON.stringify({ type: "track", state: view })));
    expect(parsed.state).toEqual(view);
  });
  it("任意の項目が無くても受け、既定で埋める", () => {
    const parsed = v.parse(TrackFrameSchema, frame({ ...base, segments: [{ id: "g-1", kind: "work", label: "a", startMs: 0, endMs: null }] }));
    expect(parsed.state.pinned).toEqual([]);
    expect(parsed.state.undo).toBeNull();
    expect(parsed.state.resumeOffer).toBe(false);
    expect(parsed.state.segments[0]!.autoClosed).toBe(false);
  });
  it("知らない項目があってもフレームごと捨てない", () => {
    expect(ok(TrackFrameSchema, frame({ ...base, future: 1, segments: [{ id: "g-1", kind: "work", label: "a", startMs: 0, endMs: 5, note: "x" }] }))).toBe(true);
  });
  it("知らない種類は作業として読み、知らない取り消しの種類は開始として読む", () => {
    const parsed = v.parse(
      TrackFrameSchema,
      frame({ ...base, segments: [{ id: "g-1", kind: "focus", label: "a", startMs: 0, endMs: 5 }], undo: { rev: 1, kind: "merge", remainingMs: 10 } }),
    );
    expect(parsed.state.segments[0]!.kind).toBe("work");
    expect(parsed.state.undo!.kind).toBe("start");
  });
  it("形が違えば拒む", () => {
    expect(ok(TrackFrameSchema, { type: "agenda", state: base })).toBe(false);
    expect(ok(TrackFrameSchema, frame({ ...base, nowMs: "2" }))).toBe(false);
    expect(ok(TrackFrameSchema, frame({ ...base, segments: [{ id: "g-1" }] }))).toBe(false);
  });
});

describe("TrackErrorFrameSchema", () => {
  it("契約のコードだけを受ける", () => {
    for (const code of TRACK_ERROR_CODES) expect(ok(TrackErrorFrameSchema, { type: "error", code, message: "x" })).toBe(true);
    expect(ok(TrackErrorFrameSchema, { type: "error", code: "AGENDA_EMPTY", message: "x" })).toBe(false);
  });
});
