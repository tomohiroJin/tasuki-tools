/**
 * プロパティテスト（fast-check）
 * T016: FR-008, SC-010
 * 任意の操作列で不変条件が成立することを検証する
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { decide } from "../src/decide.js";
import { evolve } from "../src/evolve.js";
import { initialAggregate, MIN_MEMBERS, MAX_MEMBERS } from "../src/aggregate.js";
import type { Aggregate, SessionConfig } from "../src/aggregate.js";

/** 不変条件を検証する */
function assertInvariants(agg: Aggregate) {
  // I1: rotation.length === driverCounts.length
  expect(agg.session.rotation.length).toBe(agg.session.driverCounts.length);
  // I2: currentIndex が有効範囲内
  if (agg.session.rotation.length > 0) {
    expect(agg.session.currentIndex).toBeGreaterThanOrEqual(0);
    expect(agg.session.currentIndex).toBeLessThan(agg.session.rotation.length);
  }
  // I3: 各担当回数が非負
  for (const count of agg.session.driverCounts) {
    expect(count).toBeGreaterThanOrEqual(0);
  }
  // I4: totalSwitches が非負
  expect(agg.session.totalSwitches).toBeGreaterThanOrEqual(0);
  // I5: clock の秒数が非負
  expect(agg.clock.secondsLeftAtAnchor).toBeGreaterThanOrEqual(0);
  expect(agg.clock.accumulatedElapsedMs).toBeGreaterThanOrEqual(0);
}

const actionArb = fc.constantFrom(
  "START" as const,
  "SWITCH" as const,
  "PAUSE" as const,
  "RESUME" as const,
);

describe("不変条件プロパティテスト", () => {
  it("任意の操作列で rotation.length === driverCounts.length が成立する", () => {
    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob", "Charlie"],
      intervalMinutes: 5,
    };

    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1000000, max: 2000000 }),
        (actions, startTime) => {
          let agg = initialAggregate(config);
          let now = startTime;

          assertInvariants(agg);

          for (const action of actions) {
            const result = decide({ command: "session.act", action }, agg, now);
            if (result.isOk()) {
              for (const event of result.value) {
                agg = evolve(agg, event, now);
              }
            }
            now += 1000;
            assertInvariants(agg);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("メンバー追加/削除の操作列でも不変条件が成立する", () => {
    const memberOpsArb = fc.oneof(
      fc.constant({ command: "member.add" as const, name: "Dave" }),
      fc.constant({ command: "member.add" as const, name: "Eve" }),
      fc.constant({ command: "member.remove" as const, index: 0 }),
      fc.constant({ command: "member.remove" as const, index: 1 }),
    );

    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob", "Charlie", "Dave", "Eve"],
      intervalMinutes: 5,
    };

    fc.assert(
      fc.property(
        fc.array(memberOpsArb, { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 1000000, max: 2000000 }),
        (ops, startTime) => {
          let agg = initialAggregate(config);
          const now = startTime;

          for (const op of ops) {
            const result = decide(op, agg, now);
            if (result.isOk()) {
              for (const event of result.value) {
                agg = evolve(agg, event, now);
              }
            }
            assertInvariants(agg);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("メンバー数は常に MIN_MEMBERS〜MAX_MEMBERS の範囲に収まる", () => {
    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob", "Charlie"],
      intervalMinutes: 5,
    };

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 5 }).map((name) => ({
              command: "member.add" as const,
              name: `X${name}`, // 重複を避けるためにプレフィックスを付ける
            })),
            fc.integer({ min: 0, max: 9 }).map((index) => ({
              command: "member.remove" as const,
              index,
            })),
          ),
          { minLength: 0, maxLength: 15 },
        ),
        fc.integer({ min: 1000000, max: 2000000 }),
        (ops, startTime) => {
          let agg = initialAggregate(config);
          const now = startTime;

          for (const op of ops) {
            const result = decide(op, agg, now);
            if (result.isOk()) {
              for (const event of result.value) {
                agg = evolve(agg, event, now);
              }
            }
            // メンバー数の範囲検証
            expect(agg.session.rotation.length).toBeGreaterThanOrEqual(MIN_MEMBERS);
            expect(agg.session.rotation.length).toBeLessThanOrEqual(MAX_MEMBERS);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── T024: v2 不変条件 ─────────────────────────────────────────────────────────

describe("v2 不変条件プロパティテスト（T024）", () => {
  it("SessionAborted は常に成功し、集約状態に影響を与えない", () => {
    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob", "Charlie"],
      intervalMinutes: 5,
    };

    fc.assert(
      fc.property(
        fc.integer({ min: 1000000, max: 2000000 }),
        (now) => {
          const agg = initialAggregate(config);
          const result = decide({ command: "session.abort" }, agg, now);
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            // abort イベントを evolve に渡しても集約が変わらない
            const newAgg = evolve(agg, result.value[0]!, now);
            expect(newAgg.session).toEqual(agg.session);
            expect(newAgg.clock).toEqual(agg.clock);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("driver.skip/resume の操作列でも rotation の不変条件が成立する", () => {
    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice", "Bob", "Charlie"],
      intervalMinutes: 5,
    };

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant({ command: "driver.skip" as const, participantId: "p1" }),
            fc.constant({ command: "driver.resume" as const, participantId: "p1" }),
          ),
          { minLength: 0, maxLength: 10 },
        ),
        fc.integer({ min: 1000000, max: 2000000 }),
        (ops, now) => {
          let agg = initialAggregate(config);
          for (const op of ops) {
            const result = decide(op, agg, now);
            if (result.isOk()) {
              for (const event of result.value) {
                agg = evolve(agg, event, now);
              }
            }
            assertInvariants(agg);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
