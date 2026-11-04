/**
 * 進行タイマーの境界の性質テスト（#522。fast-check）。
 *
 * 守るもの:
 * - `next` が確定する所要: 通り過ぎた区切りだけが値を持ち、**まだ来ていない区切りは触らない**
 *   （飛ばした区切りが現在の直後・次の直前・最後・次の次以降にあっても）
 * - `advanceIfDue` が期限（ちょうど・1ms 前・1ms 後）で次へ移すかどうか
 *
 * オラクルは実装（`agenda.ts` の `advanceStep`・`advanceIfDue`）の述語を写さない。
 * 「通り過ぎた／まだ来ていない」を位置で、期限を入力の足し算で、別に書く。
 * 種と回数は固定する（再現のため）。
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_AGENDA_STATE, advanceIfDue, next, replaceScenario, setSkipped, start } from "../src/agenda.js";
import type { AgendaState, ScenarioInput } from "../src/types.js";

const must = (r: { isOk(): boolean; _unsafeUnwrap(): AgendaState }): AgendaState => r._unsafeUnwrap();

const PARAMS = { seed: 522, numRuns: 300 } as const;

const input = (n: number, onTimeouts: ReadonlyArray<"wait" | "advance">, secs: ReadonlyArray<number>): ScenarioInput => ({
  title: "境界",
  steps: Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, durationSec: secs[i] ?? 60, onTimeout: onTimeouts[i] ?? "wait" })),
});
const started = (n: number, at: number): AgendaState => must(start(must(replaceScenario(INITIAL_AGENDA_STATE, input(n, [], []))), at));

describe("next: 所要の確定の範囲（#522）", () => {
  it("通り過ぎた区切りは値を持ち、まだ来ていない区切りは null のまま", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 7 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 7, maxLength: 7 }),
        fc.array(fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }), { minLength: 7, maxLength: 7 }),
        fc.constantFrom("random", "none", "all", "last", "alternate"),
        (n, t0, gaps, masks, shape) => {
          let s = started(n, t0);
          let now = t0;
          let startedAt = t0;
          let cur = 0;
          for (let k = 0; k < n && s.phase !== "finished"; k++) {
            // 現在より後ろの区切りの飛ばし方を決め直す（端の型を混ぜる）
            for (let j = cur + 1; j < n; j++) {
              const want =
                shape === "none" ? false : shape === "all" ? true : shape === "last" ? j === n - 1 : shape === "alternate" ? (j + k) % 2 === 0 : masks[k]![j]!;
              s = must(setSkipped(s, { stepId: s.steps[j]!.id, skipped: want }));
            }
            now += gaps[k]!;
            const before = s.steps.map((x) => x.skipped);
            const prior = s.steps.slice(0, cur).map((x) => x.spentMs); // 現在より前（通り過ぎた区切り）
            s = must(next(s, { stepId: s.currentId!, now }));
            // オラクル: 次に来る区切りの位置を、飛ばしていない最初の区切りとして別に数える
            let target = n;
            for (let j = cur + 1; j < n; j++) {
              if (!before[j]) {
                target = j;
                break;
              }
            }
            expect(s.phase).toBe(target === n ? "finished" : "running");
            if (target < n) expect(s.currentId).toBe(s.steps[target]!.id);
            s.steps.forEach((x, j) => {
              if (j < cur) expect(x.spentMs).toBe(prior[j]); // 通り過ぎた区切りは書き換えない
              else if (j === cur) expect(x.spentMs).toBe(now - startedAt);
              else if (j > cur && j < target) expect(x.spentMs).toBe(0); // 通り過ぎた飛ばし済み
              else if (j > cur) expect(x.spentMs).toBeNull(); // まだ来ていない（飛ばし済みでも触らない）
            });
            startedAt = now;
            cur = target;
          }
        },
      ),
      PARAMS,
    );
  });

  // 境界の例（性質テストが端を引かなくても、ここで固定する）
  const spents = (s: AgendaState): Array<number | null> => s.steps.map((x) => x.spentMs);
  const skip = (s: AgendaState, ...idx: number[]): AgendaState => idx.reduce((acc, j) => must(setSkipped(acc, { stepId: acc.steps[j]!.id, skipped: true })), s);

  it("次の次が飛ばし済み: 次に来る区切りの後ろの飛ばし済みは触らない", () => {
    const s = must(next(skip(started(4, 0), 2), { stepId: "s-1", now: 1000 }));
    expect(s.currentId).toBe("s-2");
    expect(spents(s)).toEqual([1000, null, null, null]);
  });
  it("現在の直後が飛ばし済み: その区切りだけ 0 になり、さらに後ろの飛ばし済みは触らない", () => {
    const s = must(next(skip(started(5, 0), 1, 3), { stepId: "s-1", now: 1000 }));
    expect(s.currentId).toBe("s-3");
    expect(spents(s)).toEqual([1000, 0, null, null, null]);
  });
  it("最後だけが飛ばし済み: 手前の区切りの次は終了で、最後の区切りは 0", () => {
    let s = must(next(skip(started(3, 0), 2), { stepId: "s-1", now: 1000 }));
    expect(spents(s)).toEqual([1000, null, null]);
    s = must(next(s, { stepId: "s-2", now: 3000 }));
    expect(s.phase).toBe("finished");
    expect(spents(s)).toEqual([1000, 2000, 0]);
  });
  it("終了のとき、現在より前の区切りは書き換えない", () => {
    let s = must(next(started(3, 0), { stepId: "s-1", now: 500 }));
    s = must(next(skip(s, 2), { stepId: "s-2", now: 800 }));
    expect(s.phase).toBe("finished");
    expect(spents(s)).toEqual([500, 300, 0]);
  });
});

describe("advanceIfDue: 期限での自動の遷移（#522）", () => {
  it("期限の 1ms 前は動かず、期限ちょうど・後は自動で次へ移る。移るのは「次へ自動」の区切りだけ", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.array(fc.constantFrom("wait" as const, "advance" as const), { minLength: 6, maxLength: 6 }),
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 6, maxLength: 6 }),
        fc.nat(5),
        fc.constantFrom(-1, 0, 1),
        (n, t0, kinds, secs, pick, offset) => {
          const s0 = must(start(must(replaceScenario(INITIAL_AGENDA_STATE, input(n, kinds, secs))), t0));
          // 各区切りの終わりの時刻（累積。区切りは期限ちょうどで次が始まる）
          const ends: number[] = [];
          secs.slice(0, n).reduce((acc, sec) => {
            ends.push(acc + sec * 1000);
            return acc + sec * 1000;
          }, t0);
          const target = ends[pick % n]!;
          const now = target + offset;
          // オラクル: 先頭から、「次へ自動」で終わりが now 以前の区切りを数える
          let i = 0;
          while (i < n && kinds[i] === "advance" && ends[i]! <= now) i++;
          const after = advanceIfDue(s0, now);
          if (i === 0) {
            expect(after).toBe(s0);
            return;
          }
          if (i === n) {
            expect(after.phase).toBe("finished");
            expect(after.finishedAtMs).toBe(ends[n - 1]! - t0);
          } else {
            expect(after.currentId).toBe(`s-${i + 1}`);
            expect(after.stepStartedAt).toBe(ends[i - 1]);
            expect(after.runningSince).toBe(ends[i - 1]);
          }
        },
      ),
      PARAMS,
    );
  });

  it.each([0, 7])("「次へ自動」の区切りは、期限の +%ims の呼び出しで次へ移り、次の始まりは期限（発火の遅れを持ち込まない）", (late) => {
    const s0 = must(start(must(replaceScenario(INITIAL_AGENDA_STATE, input(2, ["advance", "wait"], [10, 10]))), 100));
    expect(advanceIfDue(s0, 10_099)).toBe(s0);
    const s = advanceIfDue(s0, 10_100 + late);
    expect(s.currentId).toBe("s-2");
    expect(s.stepStartedAt).toBe(10_100);
    expect(s.steps[0]!.spentMs).toBe(10_000);
  });
  it("「待つ」の区切りは、期限を過ぎても動かない", () => {
    const s0 = must(start(must(replaceScenario(INITIAL_AGENDA_STATE, input(2, ["wait", "wait"], [10, 10]))), 0));
    expect(advanceIfDue(s0, 999_999)).toBe(s0);
  });
});
