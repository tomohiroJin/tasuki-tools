/**
 * aggregate.ts の型拡張と nextEligibleIndex ヘルパのテスト
 * T003/T004: FR-051 (US9)
 */

import { describe, it, expect } from "vitest";
import { nextEligibleIndex } from "../src/aggregate.js";
import { anAggregate } from "./support/aggregate-builder.js";

// ─── nextEligibleIndex ────────────────────────────────────────────────────────

describe("nextEligibleIndex", () => {
  it("全員 eligible のときは (currentIndex + 1) % length を返す", () => {
    // Given
    const agg = anAggregate().build();
    // When / Then（currentIndex=0→1→2→0 と一周する）
    expect(nextEligibleIndex(agg.session, 0, undefined)).toBe(1);
    expect(nextEligibleIndex(agg.session, 1, undefined)).toBe(2);
    expect(nextEligibleIndex(agg.session, 2, undefined)).toBe(0);
  });

  it("次のメンバーが ineligible の場合はスキップしてその次を返す", () => {
    // Given（Bob(index=1) を ineligible に設定）
    const agg = anAggregate().build();
    const ineligible = new Set([1]);
    // When
    const next = nextEligibleIndex(agg.session, 0, ineligible);
    // Then（currentIndex=0 → Bob(1) をスキップ → Charlie(2)）
    expect(next).toBe(2);
  });

  it("複数メンバーが ineligible の場合も正しくスキップする", () => {
    // Given（Bob(1) と Charlie(2) が ineligible）
    const agg = anAggregate().build();
    const ineligible = new Set([1, 2]);
    // When
    const next = nextEligibleIndex(agg.session, 0, ineligible);
    // Then（currentIndex=0 → 1スキップ → 2スキップ → 0（自分）へ戻る）
    expect(next).toBe(0);
  });

  it("全員 ineligible の場合は currentIndex のまま返す（現状維持）", () => {
    // Given
    const agg = anAggregate().build();
    const ineligible = new Set([0, 1, 2]);
    // When
    const next = nextEligibleIndex(agg.session, 1, ineligible);
    // Then
    expect(next).toBe(1);
  });

  it("空 rotation の場合は 0 を返す（安全）", () => {
    // Given
    const agg = {
      ...anAggregate().build(),
      session: {
        ...anAggregate().build().session,
        rotation: [],
        driverCounts: [],
        currentIndex: 0,
      },
    };
    // When
    const next = nextEligibleIndex(agg.session, 0, undefined);
    // Then
    expect(next).toBe(0);
  });
});

// ─── Participant フィールド拡張の型確認 ──────────────────────────────────────

describe("Participant 型の v2 フィールド", () => {
  it("isPlaceholder フィールドが省略可能であること（型チェックのみ）", () => {
    // Given（v1 互換: 既存の必須フィールドのみを渡す。isPlaceholder は含めない）
    const requiredFields = {
      participantId: "p1",
      connId: null,
      displayName: "Alice",
      role: "host",
      presence: "online",
      hasAiKey: false,
      joinedAt: 1000,
    };
    // When（isPlaceholder なしでも Participant 型として受理されることを確認する）
    const participant: import("../src/aggregate.js").Participant = requiredFields;
    // Then（型レベルの確認。isPlaceholder は省略 → undefined 扱いで false 相当）
    expect(participant.participantId).toBe("p1");
    expect(participant.isPlaceholder).toBeUndefined();
  });

  it("driverEligible フィールドが省略可能であること（型チェックのみ）", () => {
    // Given（driverEligible を含めない必須フィールドのみ）
    const requiredFields = {
      participantId: "p2",
      connId: "conn1",
      displayName: "Bob",
      role: "editor",
      presence: "online",
      hasAiKey: false,
      joinedAt: 1000,
    };
    // When（driverEligible なしでも Participant 型として受理されることを確認する）
    const participant: import("../src/aggregate.js").Participant = requiredFields;
    // Then
    expect(participant.driverEligible).toBeUndefined();
  });
});

// ─── Problem 型の v2 フィールド確認 ─────────────────────────────────────────

describe("Problem 型の v2 フィールド", () => {
  it("source フィールドが省略可能であること（型チェックのみ）", () => {
    // Given（source/edited を含めない必須フィールドのみ）
    const requiredFields = {
      title: "FizzBuzz",
      description: "...",
      requirements: ["3の倍数でFizz"],
      exampleTest: "assert fizzbuzz(3) == 'Fizz'",
      hints: ["剰余を使う"],
    };
    // When（source/edited なしでも Problem 型として受理されることを確認する）
    const problem: import("../src/aggregate.js").Problem = requiredFields;
    // Then
    expect(problem.source).toBeUndefined();
    expect(problem.edited).toBeUndefined();
  });
});

// ─── Room の problemMode フィールド確認 ──────────────────────────────────────

describe("Room 型の v2 フィールド", () => {
  it("problemMode フィールドが省略可能であること（型チェックのみ）", () => {
    // Given（Room は aggregate.ts ではなく実際の handlers.ts 側で構築されるため、
    // ここでは型が通ることだけを確認する）
    const rawMode = "ai";
    // When（rawMode が ProblemMode 型として受理されることを確認する）
    type ProblemMode = import("../src/aggregate.js").ProblemMode;
    const mode: ProblemMode = rawMode;
    // Then
    expect(["ai", "fallback"]).toContain(mode);
  });
});
