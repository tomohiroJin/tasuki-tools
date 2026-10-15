import { describe, it, expect } from "vitest";
import { isValidBreakPolicy, breakPolicyOf, type BreakPolicy } from "../src/break-policy.js";

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
