/**
 * aggregate.ts の型拡張と nextEligibleIndex ヘルパのテスト
 * T003/T004: FR-051 (US9)
 */

import { describe, it, expect } from "vitest";
import {
  nextEligibleIndex,
  initialAggregate,
} from "../src/aggregate.js";
import type { SessionConfig } from "../src/aggregate.js";

const baseConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};

// ─── nextEligibleIndex ────────────────────────────────────────────────────────

describe("nextEligibleIndex", () => {
  it("全員 eligible のときは (currentIndex + 1) % length を返す", () => {
    const agg = initialAggregate(baseConfig, baseConfig.members);
    // currentIndex=0 → 1
    expect(nextEligibleIndex(agg.session, 0, undefined)).toBe(1);
    expect(nextEligibleIndex(agg.session, 1, undefined)).toBe(2);
    expect(nextEligibleIndex(agg.session, 2, undefined)).toBe(0);
  });

  it("次のメンバーが ineligible の場合はスキップしてその次を返す", () => {
    const agg = initialAggregate(baseConfig, baseConfig.members);
    // Bob (index=1) を ineligible に設定
    const ineligible = new Set([1]);
    // currentIndex=0 → Bob(1) をスキップ → Charlie(2)
    expect(nextEligibleIndex(agg.session, 0, ineligible)).toBe(2);
  });

  it("複数メンバーが ineligible の場合も正しくスキップする", () => {
    const agg = initialAggregate(baseConfig, baseConfig.members);
    // Bob(1) と Charlie(2) が ineligible
    const ineligible = new Set([1, 2]);
    // currentIndex=0 → 1スキップ → 2スキップ → 0（自分）へ戻る
    expect(nextEligibleIndex(agg.session, 0, ineligible)).toBe(0);
  });

  it("全員 ineligible の場合は currentIndex のまま返す（現状維持）", () => {
    const agg = initialAggregate(baseConfig, baseConfig.members);
    const ineligible = new Set([0, 1, 2]);
    expect(nextEligibleIndex(agg.session, 1, ineligible)).toBe(1);
  });

  it("空 rotation の場合は 0 を返す（安全）", () => {
    const agg = {
      ...initialAggregate(baseConfig, baseConfig.members),
      session: {
        ...initialAggregate(baseConfig, baseConfig.members).session,
        rotation: [],
        driverCounts: [],
        currentIndex: 0,
      },
    };
    expect(nextEligibleIndex(agg.session, 0, undefined)).toBe(0);
  });
});

// ─── Participant フィールド拡張の型確認 ──────────────────────────────────────

describe("Participant 型の v2 フィールド", () => {
  it("isPlaceholder フィールドが省略可能であること（型チェックのみ）", () => {
    // 型レベルの確認。実行時は nothing を assert する
    // v1 互換: 既存の Participant は isPlaceholder なしでも型エラーにならない
    const participant: import("../src/aggregate.js").Participant = {
      participantId: "p1",
      connId: null,
      displayName: "Alice",
      role: "host",
      presence: "online",
      hasAiKey: false,
      joinedAt: 1000,
    };
    expect(participant.participantId).toBe("p1");
    // isPlaceholder は省略 → undefined 扱いで false 相当
    expect(participant.isPlaceholder).toBeUndefined();
  });

  it("driverEligible フィールドが省略可能であること（型チェックのみ）", () => {
    const participant: import("../src/aggregate.js").Participant = {
      participantId: "p2",
      connId: "conn1",
      displayName: "Bob",
      role: "editor",
      presence: "online",
      hasAiKey: false,
      joinedAt: 1000,
    };
    expect(participant.driverEligible).toBeUndefined();
  });
});

// ─── Problem 型の v2 フィールド確認 ─────────────────────────────────────────

describe("Problem 型の v2 フィールド", () => {
  it("source フィールドが省略可能であること（型チェックのみ）", () => {
    const problem: import("../src/aggregate.js").Problem = {
      title: "FizzBuzz",
      description: "...",
      requirements: ["3の倍数でFizz"],
      exampleTest: "assert fizzbuzz(3) == 'Fizz'",
      hints: ["剰余を使う"],
    };
    expect(problem.source).toBeUndefined();
    expect(problem.edited).toBeUndefined();
  });
});

// ─── Room の problemMode フィールド確認 ──────────────────────────────────────

describe("Room 型の v2 フィールド", () => {
  it("problemMode フィールドが省略可能であること（型チェックのみ）", () => {
    // Room は aggregate.ts ではなく実際の handlers.ts 側で構築されるため
    // ここでは型が通ることだけを確認する
    type ProblemMode = import("../src/aggregate.js").ProblemMode;
    const mode: ProblemMode = "ai";
    expect(["ai", "fallback"]).toContain(mode);
  });
});
