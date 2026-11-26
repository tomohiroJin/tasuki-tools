import { describe, expect, it } from "vitest";
import { BAND_STEP_MS, bandOf, stepDown } from "../src/band.js";
import type { SegmentKind, SegmentView, TrackView } from "../src/types.js";

const MIN = 60_000;

const seg = (id: string, kind: SegmentKind, label: string, startMs: number, endMs: number | null): SegmentView => ({ id, kind, label, startMs, endMs, autoClosed: false });
const view = (segments: SegmentView[], nowMs = 0): TrackView => ({ epochWallMs: 0, nowMs, segments, pinned: [], rev: 1, undo: null, resumeOffer: false });

/**
 * @requirements #476 設計 §5 D4・D5（時系列の帯）
 */
describe("stepDown", () => {
  it("Given 1 分に満たない端数 / When 切り下げる / Then 1 分の刻みの位置になる", () => {
    expect(stepDown(5 * MIN + 59_999)).toBe(5 * MIN);
    expect(stepDown(5 * MIN)).toBe(5 * MIN);
    expect(BAND_STEP_MS).toBe(MIN);
  });
});

describe("bandOf", () => {
  it("Given 区切りが無い / When 帯を作る / Then null", () => {
    expect(bandOf(view([]), 10 * MIN)).toBeNull();
  });

  it("Given 止まっている記録 / When 帯を作る / Then 最初の始まりから最後の終わりまでを、始まりの順に並べる", () => {
    const band = bandOf(view([seg("g-1", "work", "A", 10 * MIN, 20 * MIN), seg("g-2", "break", "", 20 * MIN, 25 * MIN)], 99 * MIN), 99 * MIN);
    expect(band).toEqual({
      startMs: 10 * MIN,
      endMs: 25 * MIN,
      parts: [
        { kind: "work", label: "A", startMs: 10 * MIN, endMs: 20 * MIN, ms: 10 * MIN },
        { kind: "break", label: "", startMs: 20 * MIN, endMs: 25 * MIN, ms: 5 * MIN },
      ],
    });
  });

  it("Given 区切りの間に隙間 / When 帯を作る / Then 隙間を空きとして間に置く", () => {
    const band = bandOf(view([seg("g-1", "work", "A", 0, 10 * MIN), seg("g-2", "work", "B", 15 * MIN, 20 * MIN)]), 20 * MIN);
    expect(band?.parts.map((p) => [p.kind, p.ms])).toEqual([
      ["work", 10 * MIN],
      ["gap", 5 * MIN],
      ["work", 5 * MIN],
    ]);
  });

  it("Given 計測中 / When 帯を作る / Then 終わりは、いまを 1 分の刻みに切り下げた位置", () => {
    const band = bandOf(view([seg("g-1", "work", "A", 0, 10 * MIN), seg("g-2", "work", "B", 10 * MIN, null)]), 25 * MIN + 59_000);
    expect(band?.endMs).toBe(25 * MIN);
    expect(band?.parts.at(-1)).toEqual({ kind: "work", label: "B", startMs: 10 * MIN, endMs: 25 * MIN, ms: 15 * MIN });
  });

  it("Given 刻みの内で秒が進む / When 帯を作る / Then 同じ帯になる（毎秒は動かさない）", () => {
    const segments = [seg("g-1", "work", "A", 0, null)];
    expect(bandOf(view(segments), 5 * MIN)).toEqual(bandOf(view(segments), 5 * MIN + 59_999));
    expect(bandOf(view(segments), 6 * MIN)).not.toEqual(bandOf(view(segments), 5 * MIN + 59_999));
  });

  it("Given 始めたばかりの計測中 / When 帯を作る / Then 幅 0 にせず、最小の幅で出す", () => {
    const band = bandOf(view([seg("g-1", "work", "A", 30_000, null)]), 40_000);
    expect(band?.parts).toEqual([{ kind: "work", label: "A", startMs: 30_000, endMs: 30_001, ms: 1 }]);
  });

  it("Given 長さ 0 の区切り / When 帯を作る / Then 並べない", () => {
    const band = bandOf(view([seg("g-1", "work", "A", 0, 5 * MIN), seg("g-2", "work", "B", 5 * MIN, 5 * MIN)]), 5 * MIN);
    expect(band?.parts.map((p) => p.label)).toEqual(["A"]);
  });
});
