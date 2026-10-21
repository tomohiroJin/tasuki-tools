import { describe, expect, it } from "vitest";
import { INITIAL_AGENDA_STATE, extend, next, replaceScenario, setSkipped, start, toView } from "../src/agenda.js";
import { advanceView, budgetMs, driftMs, overrunMs, plannedTotalMs, projectedEndMs, remainingMs, summaryOf } from "../src/projection.js";
import type { AgendaState, AgendaView } from "../src/types.js";
import { kptInput } from "./support/fixtures.js";

const must = (r: { _unsafeUnwrap(): AgendaState }): AgendaState => r._unsafeUnwrap();
const SEC = 1000;

/** KPT で K を 300 秒で終え、P の途中（開始から 600 秒・P の計時 300 秒）にいる */
const midP = (): AgendaState => {
  let s = must(start(must(replaceScenario(INITIAL_AGENDA_STATE, kptInput)), 0));
  s = must(next(s, { stepId: "s-1", now: 300 * SEC }));
  return s;
};

describe("予定の合計と持ち時間", () => {
  it("予定の合計は飛ばしたものも含む", () => {
    let s = midP();
    s = must(setSkipped(s, { stepId: "s-4", skipped: true }));
    expect(plannedTotalMs(toView(s, 600 * SEC))).toBe(3600 * SEC);
  });
  it("持ち時間は長さ＋延長", () => {
    const s = must(extend(midP(), { stepId: "s-2", minutes: 3 }));
    expect(budgetMs(s.steps[1]!)).toBe((420 + 180) * SEC);
  });
});

describe("見込みと押し巻き", () => {
  it("idle は予定どおり", () => {
    const v = toView(must(replaceScenario(INITIAL_AGENDA_STATE, kptInput)), 0);
    expect(projectedEndMs(v)).toBe(3600 * SEC);
    expect(driftMs(v)).toBe(0);
  });
  it("予定どおりなら押し巻きは 0", () => {
    expect(driftMs(toView(midP(), 600 * SEC))).toBe(0);
  });
  it("P の途中で +3 分すると押し 180 秒", () => {
    const s = must(extend(midP(), { stepId: "s-2", minutes: 3 }));
    expect(driftMs(toView(s, 600 * SEC))).toBe(180_000);
  });
  it("Try を飛ばすと 2400 秒の巻き（m432）", () => {
    const s = must(setSkipped(midP(), { stepId: "s-4", skipped: true }));
    const v = toView(s, 600 * SEC);
    expect(driftMs(v)).toBe(-2_400_000);
    expect(projectedEndMs(v)).toBe(1200 * SEC);
  });
  it("オーバーしたステップの残りは 0 として数える", () => {
    const s = must(next(midP(), { stepId: "s-2", now: 600 * SEC }));
    const v = toView(s, 690 * SEC);
    expect(remainingMs(v)).toBe(-30_000);
    expect(projectedEndMs(v)).toBe(690 * SEC + 2400 * SEC + 420 * SEC);
  });
  it("終了では見込みは経過そのもの", () => {
    let s = midP();
    for (const id of ["s-2", "s-3", "s-4", "s-5"]) s = must(next(s, { stepId: id, now: 1000 * SEC }));
    const v = toView(s, 5000 * SEC);
    expect(projectedEndMs(v)).toBe(1000 * SEC);
    expect(driftMs(v)).toBe(1000 * SEC - 3600 * SEC);
  });
});

describe("残りとオーバー", () => {
  it("投票（60 秒）で計時 90 秒なら残り −30 秒・オーバー 30 秒", () => {
    let s = midP();
    s = must(next(s, { stepId: "s-2", now: 600 * SEC }));
    const v = toView(s, 690 * SEC);
    expect(v.currentId).toBe("s-3");
    expect(remainingMs(v)).toBe(-30_000);
    expect(overrunMs(v)).toBe(30_000);
  });
  it("余裕があるときのオーバーは 0", () => {
    const v = toView(midP(), 600 * SEC);
    expect(remainingMs(v)).toBe(120_000);
    expect(overrunMs(v)).toBe(0);
  });
  it("idle・終了では 0", () => {
    const v = toView(must(replaceScenario(INITIAL_AGENDA_STATE, kptInput)), 0);
    expect(remainingMs(v)).toBe(0);
    expect(overrunMs(v)).toBe(0);
  });
});

describe("advanceView", () => {
  it("running は 3 つの経過すべてが進む", () => {
    const v = toView(midP(), 600 * SEC);
    expect(advanceView(v, 5000)).toMatchObject({
      runElapsedMs: v.runElapsedMs + 5000,
      stepTimerMs: v.stepTimerMs + 5000,
      stepSpentMs: v.stepSpentMs + 5000,
    });
  });
  it("一時停止の間は計時が止まり、残りは変わらず押し巻きが増える", () => {
    const base = toView(midP(), 600 * SEC);
    const paused: AgendaView = { ...base, phase: "paused" };
    const later = advanceView(paused, 600 * SEC);
    expect(later.stepTimerMs).toBe(base.stepTimerMs);
    expect(remainingMs(later)).toBe(remainingMs(paused));
    expect(driftMs(later)).toBe(driftMs(paused) + 600 * SEC);
  });
  it("idle・finished は同じ値", () => {
    const idleV = toView(must(replaceScenario(INITIAL_AGENDA_STATE, kptInput)), 0);
    expect(advanceView(idleV, 5000)).toEqual(idleV);
  });
});

describe("summaryOf", () => {
  it("行は予定・延長・所要・差・飛ばしを持ち、差の合計は押し巻きと等しい", () => {
    let s = must(start(must(replaceScenario(INITIAL_AGENDA_STATE, kptInput)), 0));
    s = must(extend(s, { stepId: "s-1", minutes: 3 }));
    s = must(setSkipped(s, { stepId: "s-4", skipped: true }));
    s = must(next(s, { stepId: "s-1", now: 400 * SEC }));
    for (const [i, id] of ["s-2", "s-3", "s-5"].entries()) s = must(next(s, { stepId: id, now: (500 + i * 100) * SEC }));
    const sum = summaryOf(toView(s, 9999 * SEC));
    expect(sum.rows[0]).toEqual({ id: "s-1", name: "Keep", plannedMs: 300 * SEC, extensionMs: 180 * SEC, spentMs: 400 * SEC, diffMs: 100 * SEC, skipped: false });
    expect(sum.rows[3]).toMatchObject({ id: "s-4", spentMs: 0, diffMs: -2400 * SEC, skipped: true });
    expect(sum.rows.reduce((a, r) => a + r.diffMs, 0)).toBe(sum.driftMs);
  });
});
