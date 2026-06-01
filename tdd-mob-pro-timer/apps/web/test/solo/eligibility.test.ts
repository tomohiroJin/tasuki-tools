/**
 * ソロモードのドライバー対象外インデックス算出のテスト
 * 項目2/4: 共有時と同じ「driverEligible=false → 交代対象外」を、index ベースで
 * soloRosterMembers から導く（改名されても participantId は index 安定なので名前照合不要）。
 */

import { describe, it, expect } from "vitest";
import { computeSoloIneligibleIndices } from "../../src/solo/eligibility.js";
import { soloRosterMembers, soloMemberId } from "../../src/solo/roster.js";

/** ロスター差分を作るヘルパー */
const overrides = (over: Partial<{
  renames: Record<string, string>;
  skips: Set<string>;
  proxies: { participantId: string; displayName: string }[];
}> = {}) => ({
  renames: {},
  skips: new Set<string>(),
  proxies: [],
  ...over,
});

describe("computeSoloIneligibleIndices（項目2/4）", () => {
  it("離脱が無ければ空集合を返す", () => {
    const members = soloRosterMembers(["Alice", "Bob"], overrides());
    expect(computeSoloIneligibleIndices(members, new Set()).size).toBe(0);
  });

  it("ホストを skip すると index 0 が対象外になる", () => {
    const skips = new Set(["solo"]);
    const members = soloRosterMembers(["Alice", "Bob"], overrides({ skips }));
    const set = computeSoloIneligibleIndices(members, skips);
    expect(set.has(0)).toBe(true);
    expect(set.has(1)).toBe(false);
  });

  it("members[1] を skip すると index 1 が対象外になる（改名後も index で安定）", () => {
    const id = soloMemberId(1);
    const skips = new Set([id]);
    const members = soloRosterMembers(
      ["Alice", "Bob"],
      overrides({ skips, renames: { [id]: "Bobby" } }),
    );
    const set = computeSoloIneligibleIndices(members, skips);
    expect(set.has(1)).toBe(true);
    expect(set.has(0)).toBe(false);
  });

  it("代理の skip は driver rotation に含まれないため対象外集合に影響しない", () => {
    const skips = new Set(["px-1"]);
    const members = soloRosterMembers(
      ["Alice", "Bob"],
      overrides({ skips, proxies: [{ participantId: "px-1", displayName: "Carol" }] }),
    );
    const set = computeSoloIneligibleIndices(members, skips);
    expect(set.size).toBe(0);
  });
});
