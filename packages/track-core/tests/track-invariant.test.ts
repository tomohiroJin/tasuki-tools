/**
 * うちわけの不変条件（設計 §4.2）の性質テスト。
 * 乱数は種つきの自前の LCG（agenda-core の性質テストと同じ作り）。任意の操作の列を当て、1 手ごとに不変条件を見る。
 */
import type { Result } from "neverthrow";
import { describe, expect, it } from "vitest";
import { adjustSegment, insertSegment, removeSegment, setSegment, splitSegment } from "../src/edit.js";
import { BACK_MINUTES, MAX_PINNED, MAX_SEGMENTS, MIN_SEGMENT_MS } from "../src/limits.js";
import { totalsOf } from "../src/projection.js";
import { autoStop, clear, createTrackState, dismissOffer, pin, start, stop, toView, undo } from "../src/track.js";
import type { TrackState } from "../src/types.js";

const RUNS = 400;
const STEPS = 60;
const PROPERTY_TIMEOUT_MS = 60_000;
const LABELS = ["設計", "実装", "調べもの", "レビュー", ""];

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x1_0000_0000;
  };
}
const int = (rnd: () => number, lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[int(rnd, 0, xs.length - 1)]!;

/** 操作ごとに「状態が実際に変わった」回数。失敗を黙って捨てるので、各操作が効いたことを数えて守る */
const effective: Record<string, number> = {};
const count = (op: string, before: TrackState, after: TrackState): TrackState => {
  if (after !== before) effective[op] = (effective[op] ?? 0) + 1;
  return after;
};
const okOr = <E>(s: TrackState, r: Result<TrackState, E>): TrackState => (r.isOk() ? r.value : s);

/** 設計 §4.2 の不変条件 1〜5 */
function assertInvariants(s: TrackState, now: number): void {
  const nowPos = now - s.epochMono;
  s.segments.forEach((g, i) => {
    const end = g.endMs ?? nowPos;
    // 2. 計測中は最後の 1 つだけ
    if (g.endMs === null) expect(i).toBe(s.segments.length - 1);
    // 3. 閉じた区切りは最短の長さ以上
    else expect(g.endMs - g.startMs).toBeGreaterThanOrEqual(MIN_SEGMENT_MS);
    expect(end).toBeGreaterThanOrEqual(g.startMs);
    // 1. 昇順で重ならない
    const next = s.segments[i + 1];
    if (next !== undefined) expect(next.startMs).toBeGreaterThanOrEqual(end);
    if (g.kind === "break") expect(g.label).toBe("");
  });
  // 5. 上限
  expect(s.segments.length).toBeLessThanOrEqual(MAX_SEGMENTS);
  expect(s.pinned.length).toBeLessThanOrEqual(MAX_PINNED);
  expect(new Set(s.segments.map((g) => g.id)).size).toBe(s.segments.length);
  // 4. 作業の合計 ＋ 休憩の合計 ＝ 区切りの長さの総和
  const view = toView(s, now);
  const totals = totalsOf(view, view.nowMs);
  const sum = s.segments.reduce((acc, g) => acc + ((g.endMs ?? nowPos) - g.startMs), 0);
  expect(totals.workMs + totals.breakMs).toBe(sum);
  expect(totals.totalMs).toBe(sum);
  expect(totals.rows.reduce((acc, r) => acc + r.ms, 0)).toBe(totals.workMs);
}

function step(s: TrackState, rnd: () => number, now: number): TrackState {
  const nowPos = now - s.epochMono;
  const anyId = s.segments.length === 0 ? "g-0" : pick(rnd, s.segments).id;
  const kind = rnd() < 0.2 ? ("break" as const) : ("work" as const);
  const backMin = rnd() < 0.2 ? pick(rnd, BACK_MINUTES) : undefined;
  const roll = int(rnd, 0, 11);
  switch (roll) {
    case 0:
    case 1:
    case 2:
      return count("start", s, okOr(s, start(s, { label: pick(rnd, LABELS), kind, ...(backMin === undefined ? {} : { backMin }), now })));
    case 3:
      return count("stop", s, okOr(s, stop(s, { ...(backMin === undefined ? {} : { backMin }), now })));
    case 4:
      return count("undo", s, undo(s, { rev: s.undo?.rev ?? -1, now }));
    case 5:
      return count("set", s, okOr(s, setSegment(s, { id: anyId, label: pick(rnd, LABELS), kind })));
    case 6:
      return count("adjust", s, okOr(s, adjustSegment(s, { id: anyId, edge: rnd() < 0.5 ? "start" : "end", atMs: nowPos - int(rnd, 0, 600_000), now })));
    case 7:
      return count("split", s, okOr(s, splitSegment(s, { id: anyId, atMs: nowPos - int(rnd, 0, 600_000), label: pick(rnd, LABELS), kind, now })));
    case 8: {
      const startMs = nowPos - int(rnd, 1_000, 900_000);
      return count("insert", s, okOr(s, insertSegment(s, { startMs, endMs: startMs + int(rnd, 0, 300_000), label: pick(rnd, LABELS), kind, now })));
    }
    case 9:
      return count("remove", s, okOr(s, removeSegment(s, { id: anyId })));
    case 10:
      return count("pin", s, okOr(s, pin(s, { label: pick(rnd, LABELS), pinned: rnd() < 0.7 })));
    default: {
      const r = rnd();
      if (r < 0.4) return count("autoStop", s, autoStop(s, { at: now - int(rnd, 0, 5_000) }));
      if (r < 0.7) return count("dismiss", s, dismissOffer(s));
      return count("clear", s, clear(s, now));
    }
  }
}

describe("うちわけの不変条件", () => {
  it(
    "どんな操作の列の後でも、区切りは昇順で重ならず、合計は区切りの長さの総和と合う",
    () => {
      for (let seed = 1; seed <= RUNS; seed++) {
        const rnd = lcg(seed);
        let now = int(rnd, 0, 1_000_000);
        let s = createTrackState({ mono: now, wallMs: 1_700_000_000_000 });
        for (let i = 0; i < STEPS; i++) {
          // 短い間（1 秒未満）と長い間を混ぜる
          now += rnd() < 0.3 ? int(rnd, 0, 999) : int(rnd, 1_000, 400_000);
          const before = s;
          s = step(s, rnd, now);
          if (s !== before) expect(s.rev).toBe(before.rev + 1);
          assertInvariants(s, now);
        }
      }
      // どの操作も、実際に効いた回がある（生成器が的を外していない）
      for (const op of ["start", "stop", "undo", "set", "adjust", "split", "insert", "remove", "pin", "autoStop", "dismiss", "clear"]) {
        expect(effective[op] ?? 0, `${op} が一度も効いていない`).toBeGreaterThan(0);
      }
    },
    PROPERTY_TIMEOUT_MS,
  );

  it(
    "開始・切り替え・停止・消す操作は、すぐ取り消すと直前の区切りの列に戻る",
    () => {
      for (let seed = 1; seed <= RUNS; seed++) {
        const rnd = lcg(seed * 7919);
        let now = int(rnd, 0, 1_000_000);
        let s = createTrackState({ mono: now, wallMs: 0 });
        for (let i = 0; i < 20; i++) {
          now += int(rnd, 500, 200_000);
          const before = s;
          const r = rnd();
          const after =
            r < 0.6
              ? okOr(s, start(s, { label: pick(rnd, LABELS), kind: "work", now }))
              : r < 0.9
                ? okOr(s, stop(s, { now }))
                : clear(s, now);
          if (after !== before) {
            const undone = undo(after, { rev: after.undo!.rev, now: now + 1 });
            expect(undone.segments).toEqual(before.segments);
            expect(undone.resumeOffer).toBe(before.resumeOffer);
          }
          s = after;
        }
      }
    },
    PROPERTY_TIMEOUT_MS,
  );
});
