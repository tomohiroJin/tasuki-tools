import { describe, it, expect } from "vitest";
import { initialAggregate, INITIAL_BREAK_STATE, type Aggregate, type BreakState } from "../src/aggregate.js";
import { isValidBreakPolicy, breakPolicyOf, isBreakDue, type BreakPolicy } from "../src/break-policy.js";

describe("isValidBreakPolicy", () => {
  it.each<[BreakPolicy, boolean]>([
    [{ trigger: "none", every: 0, mode: "auto" }, true],
    [{ trigger: "elapsed", every: 60, mode: "auto" }, true],
    [{ trigger: "elapsed", every: 90, mode: "suggest" }, true],
    [{ trigger: "elapsed", every: 2, mode: "auto" }, false], // 周回の値を経過時間に使う
    [{ trigger: "elapsed", every: 61, mode: "auto" }, false],
    [{ trigger: "rounds", every: 4, mode: "auto" }, true],
    [{ trigger: "rounds", every: 60, mode: "auto" }, false], // 経過時間の値を周回に使う
    [{ trigger: "rounds", every: 0, mode: "auto" }, false],
  ])("Given %j / When 検証する / Then %s", (policy, expected) => {
    expect(isValidBreakPolicy(policy)).toBe(expected);
  });
});

describe("breakPolicyOf", () => {
  it("Given 休憩の設定が無い / When 引く / Then なしと同じ", () => {
    expect(breakPolicyOf({ intervalMinutes: 5 }).trigger).toBe("none");
  });
  it("Given 休憩の設定がある / When 引く / Then そのまま返す", () => {
    const policy: BreakPolicy = { trigger: "rounds", every: 2, mode: "suggest" };
    expect(breakPolicyOf({ intervalMinutes: 5, break: policy })).toEqual(policy);
  });
});

/** 稼働時間・交代回数・休憩の状態だけを決めた集約（判定はこの 3 つしか読まない） */
function aggWith(elapsedMs: number, switches: number, brk: Partial<BreakState> = {}): Aggregate {
  const base = initialAggregate({ intervalMinutes: 5 }, []);
  return {
    session: { ...base.session, totalSwitches: switches, break: { ...INITIAL_BREAK_STATE, ...brk } },
    clock: { ...base.clock, accumulatedElapsedMs: elapsedMs },
  };
}
const MIN = 60_000;

describe("isBreakDue", () => {
  it("Given なし / When どれだけ経っても / Then 偽", () => {
    expect(isBreakDue(aggWith(999 * MIN, 999), { trigger: "none", every: 0, mode: "auto" }, 4)).toBe(false);
  });
  it.each([
    [59 * MIN, false],
    [60 * MIN, true],
  ])("Given 経過 60 分・基準 0 / When 稼働 %i ms / Then %s", (elapsed, expected) => {
    expect(isBreakDue(aggWith(elapsed, 0), { trigger: "elapsed", every: 60, mode: "auto" }, 4)).toBe(expected);
  });
  it("Given 経過 60 分・前の休憩が稼働 30 分の時点 / When 稼働 89 分 / Then 偽（休憩のたびに数え直す）", () => {
    const agg = aggWith(89 * MIN, 0, { baseline: { elapsedMs: 30 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "auto" }, 4)).toBe(false);
  });
  it.each([
    [7, false],
    [8, true],
  ])("Given 周回 2・適格 4 席 / When 交代 %i 回 / Then %s", (switches, expected) => {
    expect(isBreakDue(aggWith(0, switches), { trigger: "rounds", every: 2, mode: "auto" }, 4)).toBe(expected);
  });
  it("Given 周回 1・適格 2 席（4 席中 2 人が一時離脱） / When 交代 2 回 / Then 真（分母は適格な席の数）", () => {
    expect(isBreakDue(aggWith(0, 2), { trigger: "rounds", every: 1, mode: "auto" }, 2)).toBe(true);
  });
  it.each([0, 1])("Given 周回・適格 %i 席 / When 交代が何回でも / Then 偽（輪が 1 人だと交代回数が増えない）", (seats) => {
    expect(isBreakDue(aggWith(0, 100), { trigger: "rounds", every: 1, mode: "auto" }, seats)).toBe(false);
  });
  it("Given 知らせるだけ・稼働 60 分で知らせ済み / When 稼働 119 分 / Then 偽（次の間隔まで知らせ直さない）", () => {
    const agg = aggWith(119 * MIN, 0, { suggestedAt: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "suggest" }, 4)).toBe(false);
  });
  it("Given 知らせるだけ・稼働 60 分で知らせ済み / When 稼働 120 分 / Then 真", () => {
    const agg = aggWith(120 * MIN, 0, { suggestedAt: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "suggest" }, 4)).toBe(true);
  });
  it("Given 知らせるだけ・まだ知らせていない・前の休憩が稼働 60 分の時点 / When 稼働 100 分 / Then 偽（印が無ければ前の休憩から数える）", () => {
    // 印（suggestedAt）が null のときの基準は baseline。0 から数えると 100 ≥ 60 で真に倒れる
    const agg = aggWith(100 * MIN, 0, { suggestedAt: null, baseline: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "suggest" }, 4)).toBe(false);
  });
  it("Given 自動・知らせの印が残る / When 判定する / Then 印は見ない（基準は baseline）", () => {
    const agg = aggWith(60 * MIN, 0, { suggestedAt: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "auto" }, 4)).toBe(true);
  });
  it("Given 休憩中 / When 判定する / Then 偽", () => {
    const agg = aggWith(999 * MIN, 999, { since: 1 });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 30, mode: "auto" }, 4)).toBe(false);
  });
});
