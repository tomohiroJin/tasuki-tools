/**
 * うちわけの不変条件（設計 §4.2）の性質テスト。
 * 乱数は種つきの自前の LCG（agenda-core の性質テストと同じ作り）。任意の操作の列を当て、1 手ごとに不変条件を見る。
 */
import type { Result } from "neverthrow";
import { describe, expect, it } from "vitest";
import { adjustSegment, away, insertSegment, removeSegment, setSegment, splitSegment } from "../src/edit.js";
import { BACK_MINUTES, MAX_PINNED, MAX_SEGMENTS, MIN_SEGMENT_MS } from "../src/limits.js";
import { totalsOf } from "../src/projection.js";
import { autoStop, clear, createTrackState, dismissOffer, pin, start, stop, toView, undo } from "../src/track.js";
import type { Segment, TrackState } from "../src/types.js";

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

/**
 * 設計 §4.2 の不変条件 1〜5。破れを文にして返す（破れが無ければ空）。
 *
 * **1 手ごとの判定に `expect` を使わない**（#692）。種 400 × 60 手で、区切りごとに `expect` を当てると呼び出しが約 51 万回になり、
 * カバレッジを取りながら並べて流す CI では 1 回の試験に 37 秒かかって、60 秒の上限を超えることがあった（手元は約 3 秒）。
 * 素の比較で破れを集め、呼ぶ側が `expect` を 1 手につき 1 回だけ当てる。見ている条件は同じ。
 */
function invariantViolations(s: TrackState, now: number): string[] {
  const out: string[] = [];
  const nowPos = now - s.epochMono;
  const ids = new Set<string>();
  let sum = 0;
  for (let i = 0; i < s.segments.length; i++) {
    const g = s.segments[i]!;
    const end = g.endMs ?? nowPos;
    // 2. 計測中は最後の 1 つだけ
    if (g.endMs === null) {
      if (i !== s.segments.length - 1) out.push(`区切り ${String(i)}: 計測中なのに最後でない`);
    }
    // 3. 閉じた区切りは最短の長さ以上
    else if (g.endMs - g.startMs < MIN_SEGMENT_MS) out.push(`区切り ${String(i)}: 長さ ${String(g.endMs - g.startMs)}ms が最短 ${String(MIN_SEGMENT_MS)}ms に満たない`);
    if (end < g.startMs) out.push(`区切り ${String(i)}: 終わり ${String(end)} が始まり ${String(g.startMs)} より前`);
    // 1. 昇順で重ならない
    const next = s.segments[i + 1];
    if (next !== undefined && next.startMs < end) out.push(`区切り ${String(i)}: 次の始まり ${String(next.startMs)} が終わり ${String(end)} より前（重なる）`);
    if (g.kind === "break" && g.label !== "") out.push(`区切り ${String(i)}: 休憩なのに名前「${g.label}」がある`);
    ids.add(g.id);
    sum += end - g.startMs;
  }
  // 5. 上限
  if (s.segments.length > MAX_SEGMENTS) out.push(`区切りが ${String(s.segments.length)} 件（上限 ${String(MAX_SEGMENTS)}）`);
  if (s.pinned.length > MAX_PINNED) out.push(`ピンが ${String(s.pinned.length)} 件（上限 ${String(MAX_PINNED)}）`);
  if (ids.size !== s.segments.length) out.push(`区切りの id が重複している（${String(ids.size)} 種・${String(s.segments.length)} 件）`);
  // 4. 作業の合計 ＋ 休憩の合計 ＝ 区切りの長さの総和
  const view = toView(s, now);
  const totals = totalsOf(view, view.nowMs);
  out.push(...totalsViolations(totals, sum));
  return out;
}

/** 不変条件 4 の比べ方。合計は製品コードが出すので、破れた合計を手で渡して確かめられるよう、比べる所だけを分けてある。 */
function totalsViolations(totals: { readonly workMs: number; readonly breakMs: number; readonly totalMs: number; readonly rows: readonly { readonly ms: number }[] }, sum: number): string[] {
  const out: string[] = [];
  if (totals.workMs + totals.breakMs !== sum) out.push(`作業 ${String(totals.workMs)} ＋ 休憩 ${String(totals.breakMs)} が、長さの総和 ${String(sum)} と合わない`);
  if (totals.totalMs !== sum) out.push(`合計 ${String(totals.totalMs)} が、長さの総和 ${String(sum)} と合わない`);
  let rows = 0;
  for (const r of totals.rows) rows += r.ms;
  if (rows !== totals.workMs) out.push(`行の合計 ${String(rows)} が、作業の合計 ${String(totals.workMs)} と合わない`);
  return out;
}

/** 状態が変わったら rev は 1 つ進む。変わらなければ見ない。 */
function revViolations(before: TrackState, after: TrackState): string[] {
  return after !== before && after.rev !== before.rev + 1 ? [`rev が ${String(before.rev)} から ${String(after.rev)} になった（変われば 1 つ進むはず）`] : [];
}

function step(s: TrackState, rnd: () => number, now: number): TrackState {
  const nowPos = now - s.epochMono;
  const anyId = s.segments.length === 0 ? "g-0" : pick(rnd, s.segments).id;
  const kind = rnd() < 0.2 ? ("break" as const) : ("work" as const);
  const backMin = rnd() < 0.2 ? pick(rnd, BACK_MINUTES) : undefined;
  const roll = int(rnd, 0, 12);
  switch (roll) {
    case 0:
    case 1:
    case 2:
      return count("start", s, okOr(s, start(s, { label: pick(rnd, LABELS), kind, ...(backMin === undefined ? {} : { backMin }), now })));
    case 3:
      // 位置で止める（離れていたときの問いかけ）。さかのぼりとは同時に使わない
      if (backMin === undefined && rnd() < 0.3) return count("stopAt", s, okOr(s, stop(s, { atMs: nowPos - int(rnd, 0, 600_000), now })));
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
    case 12:
      return count("away", s, okOr(s, away(s, { fromMs: nowPos - int(rnd, 0, 900_000), now })));
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

/**
 * 判定そのもの（`invariantViolations`）が破れを拾うこと。判定を素の比較で書いたので、判定が黙って何も返さなくなると、
 * 下の性質テストは何を当てても緑になる。破れた状態（合計と rev は、破れた値）を手で作り、条件ごとに破れが返ることを固定する（#692）。
 */
describe("不変条件の判定は、破れた状態を見逃さない", () => {
  const seg = (id: string, startMs: number, endMs: number | null, over: Partial<Segment> = {}): Segment => ({ id, kind: "work", label: "実装", startMs, endMs, autoClosed: false, ...over });
  const stateOf = (segments: readonly Segment[], over: Partial<TrackState> = {}): TrackState => ({ ...createTrackState({ mono: 0, wallMs: 0 }), segments, ...over });
  const NOW = 100_000;

  it("Given 正しい状態（閉じた区切り 2 つと計測中 1 つ） / When 判定する / Then 破れは無い", () => {
    expect(invariantViolations(stateOf([seg("a", 0, 5_000), seg("b", 5_000, 9_000, { kind: "break", label: "" }), seg("c", 9_000, null)]), NOW)).toEqual([]);
  });

  it.each([
    ["1. 区切りが重なる", stateOf([seg("a", 0, 5_000), seg("b", 4_000, 9_000)]), "重なる"],
    ["2. 計測中の区切りが最後でない", stateOf([seg("a", 0, null), seg("b", 200_000, 205_000)]), "計測中なのに最後でない"],
    ["3. 閉じた区切りが最短に満たない", stateOf([seg("a", 0, MIN_SEGMENT_MS - 1)]), "最短"],
    ["終わりが始まりより前", stateOf([seg("a", 5_000, 1_000)]), "より前"],
    ["休憩に名前がある", stateOf([seg("a", 0, 5_000, { kind: "break", label: "昼" })]), "休憩なのに名前"],
    ["5. 区切りが上限を超える", stateOf(Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => seg(`g-${String(i)}`, i * 2_000, i * 2_000 + 1_000))), "区切りが"],
    ["5. ピンが上限を超える", stateOf([], { pinned: Array.from({ length: MAX_PINNED + 1 }, (_, i) => `p${String(i)}`) }), "ピンが"],
    ["id が重複している", stateOf([seg("a", 0, 5_000), seg("a", 5_000, 9_000)]), "id が重複"],
  ])("Given %s / When 判定する / Then その破れを返す", (_, state, expected) => {
    const violations = invariantViolations(state, NOW);
    expect(violations.join("\n")).toContain(expected);
  });

  it.each([
    ["4. 作業 ＋ 休憩が総和と合わない", { workMs: 6_000, breakMs: 4_000, totalMs: 9_000, rows: [{ ms: 6_000 }] }, "＋ 休憩"],
    ["4. 合計が総和と合わない", { workMs: 5_000, breakMs: 4_000, totalMs: 9_001, rows: [{ ms: 5_000 }] }, "合計 9001 が"],
    ["4. 行の合計が作業の合計と合わない", { workMs: 5_000, breakMs: 4_000, totalMs: 9_000, rows: [{ ms: 3_000 }, { ms: 1_999 }] }, "行の合計"],
  ])("Given %s / When 合計を比べる / Then その破れだけを返す", (_, totals, expected) => {
    const violations = totalsViolations(totals, 9_000);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(expected);
  });

  it("Given 合計が総和と合っている / When 合計を比べる / Then 破れは無い", () => {
    expect(totalsViolations({ workMs: 5_000, breakMs: 4_000, totalMs: 9_000, rows: [{ ms: 3_000 }, { ms: 2_000 }] }, 9_000)).toEqual([]);
  });

  it("Given 状態が変わった / When rev を比べる / Then 1 つ進んでいなければ破れを返し、変わらなければ見ない", () => {
    const before = stateOf([]);
    expect(revViolations(before, { ...before, rev: before.rev })).toHaveLength(1);
    expect(revViolations(before, { ...before, rev: before.rev + 2 })).toHaveLength(1);
    expect(revViolations(before, { ...before, rev: before.rev + 1 })).toEqual([]);
    expect(revViolations(before, before)).toEqual([]);
  });
});

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
          const violations = [...invariantViolations(s, now), ...revViolations(before, s)];
          // 破れた種と手を名指しする（どの列で破れたかを、失敗の文だけで再現できるように）
          expect(violations, `種 ${String(seed)}・${String(i + 1)} 手目`).toEqual([]);
        }
      }
      // どの操作も、実際に効いた回がある（生成器が的を外していない）
      for (const op of ["start", "stop", "undo", "set", "adjust", "split", "insert", "remove", "pin", "stopAt", "away", "autoStop", "dismiss", "clear"]) {
        expect(effective[op] ?? 0, `${op} が一度も効いていない`).toBeGreaterThan(0);
      }
    },
    PROPERTY_TIMEOUT_MS,
  );

  it(
    "開始・切り替え・停止・離れた間の休憩・消す操作は、すぐ取り消すと直前の区切りの列に戻る",
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
              : r < 0.8
                ? okOr(s, stop(s, { now }))
                : r < 0.9
                  ? okOr(s, rnd() < 0.5 ? away(s, { fromMs: now - s.epochMono - int(rnd, 1_000, 300_000), now }) : stop(s, { atMs: now - s.epochMono - int(rnd, 0, 300_000), now }))
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
