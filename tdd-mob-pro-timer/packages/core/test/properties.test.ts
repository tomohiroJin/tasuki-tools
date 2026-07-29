/**
 * プロパティテスト（fast-check）
 * T016: FR-008, SC-010
 * 任意の操作列で不変条件が成立することを検証する
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { decide } from "../src/decide.js";
import { evolve } from "../src/evolve.js";
import { MAX_MEMBERS } from "../src/aggregate.js";
import type { Aggregate } from "../src/aggregate.js";
import { anAggregate } from "./support/aggregate-builder.js";

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
    // When / Then（各操作の適用後に不変条件を検証する）
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1000000, max: 2000000 }),
        (actions, startTime) => {
          let agg = anAggregate().build();
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
    // Given
    const memberOpsArb = fc.oneof(
      fc.constant({ command: "member.add" as const, participantId: "Dave" }),
      fc.constant({ command: "member.add" as const, participantId: "Eve" }),
      fc.constant({ command: "member.remove" as const, index: 0 }),
      fc.constant({ command: "member.remove" as const, index: 1 }),
    );

    // When / Then
    fc.assert(
      fc.property(
        fc.array(memberOpsArb, { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 1000000, max: 2000000 }),
        (ops, startTime) => {
          let agg = anAggregate().withRotation("Alice", "Bob", "Charlie", "Dave", "Eve").build();
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

  it("メンバー数は常に 1〜MAX_MEMBERS の範囲に収まる（2層モデル: 各自が出入りするので下限は1）", () => {
    // Given
    const opsArb = fc.array(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 5 }).map((name) => ({
          command: "member.add" as const,
          participantId: `X${name}`, // 重複を避けるためにプレフィックスを付ける
        })),
        fc.integer({ min: 0, max: 9 }).map((index) => ({
          command: "member.remove" as const,
          index,
        })),
      ),
      { minLength: 0, maxLength: 15 },
    );

    // When / Then（メンバー数の範囲検証。最後の1人は外れられない＝下限1）
    fc.assert(
      fc.property(
        opsArb,
        fc.integer({ min: 1000000, max: 2000000 }),
        (ops, startTime) => {
          let agg = anAggregate().build();
          const now = startTime;

          for (const op of ops) {
            const result = decide(op, agg, now);
            if (result.isOk()) {
              for (const event of result.value) {
                agg = evolve(agg, event, now);
              }
            }
            expect(agg.session.rotation.length).toBeGreaterThanOrEqual(1);
            expect(agg.session.rotation.length).toBeLessThanOrEqual(MAX_MEMBERS);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

/**
 * @requirements T024
 */
describe("v2 不変条件プロパティテスト", () => {
  it("SessionAborted は常に成功し、集約状態に影響を与えない", () => {
    // When / Then
    fc.assert(
      fc.property(
        fc.integer({ min: 1000000, max: 2000000 }),
        (now) => {
          const agg = anAggregate().build();
          const result = decide({ command: "session.abort" }, agg, now);
          // abort イベントを意図で取り出す（配列に1件のみ含まれる）
          const abortedEvent = result._unsafeUnwrap().find((e) => e.type === "SessionAborted")!;
          const newAgg = evolve(agg, abortedEvent, now);
          expect(newAgg.session).toEqual(agg.session);
          expect(newAgg.clock).toEqual(agg.clock);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("driver.skip/resume の操作列でも rotation の不変条件が成立する", () => {
    // Given
    const opsArb = fc.array(
      fc.oneof(
        fc.constant({ command: "driver.skip" as const, participantId: "p1" }),
        fc.constant({ command: "driver.resume" as const, participantId: "p1" }),
      ),
      { minLength: 0, maxLength: 10 },
    );

    // When / Then
    fc.assert(
      fc.property(
        opsArb,
        fc.integer({ min: 1000000, max: 2000000 }),
        (ops, now) => {
          let agg = anAggregate().build();
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
