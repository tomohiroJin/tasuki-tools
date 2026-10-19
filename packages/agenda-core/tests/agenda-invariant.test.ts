/**
 * 進行タイマーの不変条件（設計 §4.1）の性質テスト。
 * 乱数は種つきの自前の LCG（依存を足さない）。オラクルは操作の列から足し上げ、projection.ts を使わない。
 */
import { describe, expect, it } from "vitest";
import { INITIAL_AGENDA_STATE, advanceIfDue, extend, next, pause, replaceScenario, resume, setSkipped, start, toView } from "../src/agenda.js";
import { summaryOf } from "../src/projection.js";
import type { AgendaState, ScenarioInput } from "../src/types.js";

const RUNS = 500;

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x1_0000_0000;
  };
}

const int = (rnd: () => number, lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

function scenario(rnd: () => number, allWait: boolean): ScenarioInput {
  const n = int(rnd, 1, 6);
  return {
    title: "乱数",
    steps: Array.from({ length: n }, (_, i) => ({
      name: `S${i + 1}`,
      durationSec: int(rnd, 1, 10) * 60,
      onTimeout: allWait || rnd() < 0.5 ? ("wait" as const) : ("advance" as const),
    })),
  };
}

const okOr = (s: AgendaState, r: { isOk(): boolean; _unsafeUnwrap(): AgendaState }): AgendaState => (r.isOk() ? r._unsafeUnwrap() : s);

/** 1 回の実行。操作を適用するたびに不変条件を見て、オラクルの所要を足し上げる */
function run(seed: number, allWait: boolean): { final: AgendaState; now: number } {
  const rnd = lcg(seed);
  let s = okOr(INITIAL_AGENDA_STATE, replaceScenario(INITIAL_AGENDA_STATE, scenario(rnd, allWait)));
  let now = int(rnd, 0, 100_000);
  const t0 = now;
  s = okOr(s, start(s, now));
  // オラクル: ステップごとの所要を、いまのステップが変わった時点で確定する（wait のみのとき。advance は期限で変わるため）
  const spent = new Map<string, number>();
  let oracleCur = s.currentId;
  let boundary = now;
  const steps = 40;
  for (let i = 0; i < steps && s.phase !== "finished"; i++) {
    const op = rnd();
    const cur = s.currentId;
    if (op < 0.3) {
      now += int(rnd, 0, 900_000);
      s = advanceIfDue(s, now);
    } else if (op < 0.55 && cur !== null) {
      now += int(rnd, 0, 300_000);
      s = okOr(s, next(s, { stepId: cur, now }));
    } else if (op < 0.7) {
      now += int(rnd, 0, 300_000);
      s = okOr(s, pause(s, now));
    } else if (op < 0.85) {
      now += int(rnd, 0, 300_000);
      s = okOr(s, resume(s, now));
    } else if (op < 0.92 && cur !== null) {
      s = okOr(s, extend(s, { stepId: cur, minutes: [1, 3, 5][int(rnd, 0, 2)]!, now }));
    } else {
      const target = s.steps[int(rnd, 0, s.steps.length - 1)]!;
      s = okOr(s, setSkipped(s, { stepId: target.id, skipped: rnd() < 0.5 }));
    }

    if (allWait && s.currentId !== oracleCur) {
      if (oracleCur !== null) spent.set(oracleCur, now - boundary);
      boundary = now;
      oracleCur = s.currentId;
    }

    // 不変条件: 終えたステップの所要の合計 ＋ いまのステップの所要 ＝ 実時間の経過
    const v = toView(s, now);
    const finishedSum = s.steps.reduce((a, x) => a + (x.spentMs ?? 0), 0);
    expect(finishedSum + v.stepSpentMs).toBe(v.runElapsedMs);
    if (s.phase !== "finished") expect(v.runElapsedMs).toBe(now - t0);
  }
  if (allWait) {
    // オラクルとの突き合わせ（確定済みの行だけ）
    for (const x of s.steps) {
      if (x.spentMs === null) continue;
      expect(x.spentMs).toBe(x.skipped ? 0 : (spent.get(x.id) ?? 0));
    }
  }
  return { final: s, now };
}

/** 終わるまで進める（終了後の一覧の等式を見るため） */
function finish(s: AgendaState, now: number): { s: AgendaState; now: number } {
  let t = now;
  let cur = s;
  while (cur.phase !== "finished") {
    t += 1000;
    if (cur.phase === "paused") cur = okOr(cur, resume(cur, t));
    cur = okOr(cur, next(cur, { stepId: cur.currentId!, now: t }));
  }
  return { s: cur, now: t };
}

describe.each([
  ["すべて wait（ステップごとのオラクルつき）", true],
  ["advance を含む", false],
])("不変条件の性質テスト: %s", (_n, allWait) => {
  it(`任意の操作の列のあとで、所要の合計は実時間の経過と等しい（${RUNS} 通り）（m431）`, () => {
    for (let seed = 1; seed <= RUNS; seed++) run(seed, allWait);
  });

  it(`終了後、行の差の合計は押し巻きと等しい（${RUNS} 通り）`, () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const r = run(seed, allWait);
      const { s, now } = finish(r.final, r.now);
      const view = toView(s, now + 5000);
      const sum = summaryOf(view);
      expect(sum.rows.reduce((a, x) => a + x.diffMs, 0)).toBe(sum.driftMs);
      expect(sum.rows.reduce((a, x) => a + x.spentMs, 0)).toBe(view.runElapsedMs);
    }
  });
});
