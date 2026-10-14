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

/**
 * 破れている不変条件を名前で返す（空なら全て成り立つ）。
 *
 * 比較は `!(x >= 0)` の形で書き、`NaN` も破れとして拾う。操作列の各段で呼ぶので、
 * 判定と表明を分けて `expect` を 1 段 1 回にまとめる
 * （段ごとに `expect` を 8 回呼ぶと、CI の並列実行で既定の 5 秒を超えた）。
 */
function invariantViolations(agg: Aggregate): string[] {
  const { rotation, driverCounts, currentIndex, totalSwitches } = agg.session;
  const violations: string[] = [];
  // I1: rotation.length === driverCounts.length
  if (rotation.length !== driverCounts.length) violations.push("I1: rotation.length !== driverCounts.length");
  // I2: currentIndex の不変条件（正本は aggregate.ts の SessionState.currentIndex の注釈。#376）
  if (rotation.length === 0) {
    if (currentIndex !== 0) violations.push("I2: 輪が空なのに currentIndex が 0 でない");
  } else if (!(Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < rotation.length)) {
    violations.push("I2: currentIndex が範囲外");
  }
  // I3: 各担当回数が非負
  if (!driverCounts.every((count) => count >= 0)) violations.push("I3: 担当回数が負");
  // I4: totalSwitches が非負
  if (!(totalSwitches >= 0)) violations.push("I4: totalSwitches が負");
  // I5: clock の秒数が非負
  if (!(agg.clock.secondsLeftAtAnchor >= 0)) violations.push("I5: secondsLeftAtAnchor が負");
  if (!(agg.clock.accumulatedElapsedMs >= 0)) violations.push("I5: accumulatedElapsedMs が負");
  return violations;
}

/** 不変条件を検証する */
function assertInvariants(agg: Aggregate) {
  expect(invariantViolations(agg)).toEqual([]);
}

const actionArb = fc.constantFrom(
  "START" as const,
  "SWITCH" as const,
  "PAUSE" as const,
  "RESUME" as const,
);

describe("不変条件プロパティテスト", () => {
  it("任意の操作列で rotation.length === driverCounts.length が成立する", () => {
    // Given（actionArb が生成する任意長の操作列を対象にする）
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
    // Given（fc.integer が生成する任意の時刻を対象にする）
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

/**
 * 全てのコマンドを混ぜた列での不変条件（#364 Task 1）。
 *
 * 上の性質はコマンドの種類ごとに列を作る。ここでは輪の出入り・並べ替え・担当の指名・
 * セッションの操作を 1 つの列に混ぜ、**組み合わせで初めて崩れる**ものを拾う
 * （例: 担当を指名した後に、その手前の席を外す）。各段で見るのは次の 3 つ。
 *
 * - I1: `rotation.length === driverCounts.length`
 * - I2: `currentIndex` の不変条件（正本は `aggregate.ts` の `SessionState.currentIndex` の注釈。この列では輪が空にならないので `0 ≤ currentIndex < rotation.length`）
 * - 輪が空にならない（`decide` が最後の 1 人の `member.remove` を拒む。製品の決まり「最後の 1 人は外れられない」の固定。
 *   空の輪を渡された evolve が壊れないことは、下の「evolve に直接流すイベントの列」が #376 で固定する）
 */
describe("全てのコマンドを混ぜた列での不変条件（#364）", () => {
  type Command = Parameters<typeof decide>[0];
  const indexArb = fc.integer({ min: -1, max: 6 });
  const commandArb: fc.Arbitrary<Command> = fc.oneof(
    fc.constantFrom("START", "SWITCH", "PAUSE", "RESUME", "RESTART").map(
      (action): Command => ({ command: "session.act", action }),
    ),
    fc.constantFrom("A", "B", "C", "D", "E", "F", "G").map(
      (participantId): Command => ({ command: "member.add", participantId }),
    ),
    // 削除は重みを上げる。輪が空になる手前（残り 1 人）まで届く列を十分に作るため
    { arbitrary: indexArb.map((index): Command => ({ command: "member.remove", index })), weight: 4 },
    fc.tuple(indexArb, indexArb).map(
      ([fromIndex, toIndex]): Command => ({ command: "member.move", fromIndex, toIndex }),
    ),
    fc.shuffledSubarray([0, 1, 2, 3, 4, 5]).map((order): Command => ({ command: "member.shuffle", order })),
    indexArb.map((index): Command => ({ command: "driver.assign", index })),
    fc.constant<Command>({ command: "session.complete", topicTitle: null }),
    fc.constant<Command>({ command: "session.reset" }),
    fc.constant<Command>({ command: "session.abort" }),
  );

  it("Given 3 人の輪 / When 任意のコマンドの列を decide → evolve で流す / Then 各段で I1・I2 が成り立ち、輪は空にならない", () => {
    fc.assert(
      fc.property(
        // `size: "max"`: fast-check は既定で配列を短く作る。短い列では輪が 1 人まで減らない
        fc.array(commandArb, { minLength: 0, maxLength: 30, size: "max" }),
        fc.integer({ min: 1000000, max: 2000000 }),
        (commands, startTime) => {
          // Given
          let agg = anAggregate().withRotation("A", "B", "C").build();
          let now = startTime;
          for (const cmd of commands) {
            // When
            const result = decide(cmd, agg, now);
            if (result.isOk()) {
              for (const event of result.value) {
                agg = evolve(agg, event, now);
              }
            }
            now += 1000;
            // Then
            const violations = invariantViolations(agg);
            if (agg.session.rotation.length < 1) violations.push("輪が空");
            expect(violations).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

/**
 * evolve に直接流すイベントの列での不変条件（#376）。
 *
 * 上の性質はどれも `decide` を通すので、`decide` が拒む入力（輪を空にする `MemberRemoved`・範囲外の添字）には届かない。
 * ここでは `decide` を通さずにイベントを組み、イベントの再生や将来の経路から届く入力を模す。
 * evolve は全域関数（`evolve.ts` の冒頭）なので、どの入力でも次を保つ。
 *
 * - I1・I2（`currentIndex` の不変条件。正本は `aggregate.ts` の `SessionState.currentIndex` の注釈）
 * - 輪が空なら時計は止まり、一時停止として表す（担当の居ない輪でタイマーが回らない）
 * - 範囲外の添字（負・輪の長さ以上・整数でない）の `MemberRemoved` / `MemberMoved` は集約を変えない
 *
 * 並べ替えの順列と交代先だけは前提を満たすものを組む（それぞれ `decide` が別に確かめる前提で、#376 の射程の外）。
 */
describe("evolve に直接流すイベントの列での不変条件（#376）", () => {
  type Event = Parameters<typeof evolve>[1];
  type Kind = "remove" | "add" | "move" | "shuffle" | "switch" | "session" | "reset";
  // 削除の重みを上げる。輪を空にしてから先の列を十分に作るため
  const kindArb = fc.oneof(
    { arbitrary: fc.constant<Kind>("remove"), weight: 5 },
    { arbitrary: fc.constant<Kind>("add"), weight: 2 },
    { arbitrary: fc.constantFrom<Kind>("move", "shuffle", "switch", "session", "reset"), weight: 3 },
  );
  const stepArb = fc.tuple(kindArb, fc.nat(), fc.nat());
  const SESSION_EVENTS = ["SessionStarted", "SessionPaused", "SessionResumed", "DriverTimerReset", "BreakStarted", "BreakEnded"] as const;

  /**
   * 席の添字を組む。範囲内を半分、範囲外（負・長さちょうど・長さより先・整数でない）を半分にする。
   * 空の輪ではどれも範囲外になる。
   */
  function seatIndex(n: number, len: number): number {
    const inRange = len === 0 ? 0 : n % len;
    switch (n % 8) {
      case 0: return -1 - (n % 3);
      case 1: return len;
      case 2: return len + 1 + (n % 3);
      case 3: return inRange + 0.5;
      default: return inRange;
    }
  }

  function isSeatIndex(i: number, len: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < len;
  }

  /** いまの集約に対して、イベントを 1 つ組む */
  function eventFor(agg: Aggregate, [kind, a, b]: [Kind, number, number], now: number, serial: number): Event {
    const len = agg.session.rotation.length;
    switch (kind) {
      case "remove":
        return { type: "MemberRemoved", index: seatIndex(a, len), now };
      case "add":
        return { type: "MemberAdded", participantId: `P${serial}`, now };
      case "move":
        return { type: "MemberMoved", fromIndex: seatIndex(a, len), toIndex: seatIndex(b, len), now };
      case "shuffle":
        // 回転は [0..len-1] の順列（空の輪では空の順列）
        return { type: "MembersShuffled", order: Array.from({ length: len }, (_, i) => (i + a) % len), now };
      case "switch":
        return { type: "DriverSwitched", nextIndex: len === 0 ? 0 : a % len, now };
      case "session":
        return { type: SESSION_EVENTS[a % SESSION_EVENTS.length]!, now };
      case "reset":
        return { type: "SessionReset", now };
    }
  }

  /** 範囲外の添字を持つ席の出し入れか */
  function hasOutOfRangeIndex(event: Event, len: number): boolean {
    if (event.type === "MemberRemoved") return !isSeatIndex(event.index, len);
    if (event.type === "MemberMoved") return !isSeatIndex(event.fromIndex, len) || !isSeatIndex(event.toIndex, len);
    return false;
  }

  it("Given 1〜3 人の走っている輪 / When 輪を空にする MemberRemoved と範囲外の添字を含む任意のイベントの列を evolve へ直接流す / Then 各段で I1・I2 が成り立ち、空の輪の時計は一時停止で止まり、範囲外の添字は集約を変えない", () => {
    let reachedEmpty = 0;
    let sawOutOfRange = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.array(stepArb, { minLength: 0, maxLength: 30, size: "max" }),
        fc.integer({ min: 1000000, max: 2000000 }),
        (initialSize, steps, startTime) => {
          // Given（走っている輪から始める。止まった輪から始めると「空の輪で時計が回る」に届かない）
          const ids = ["A", "B", "C"].slice(0, initialSize);
          let agg = anAggregate().withRotation(...ids).running().build();
          let now = startTime;
          let serial = 0;
          for (const step of steps) {
            // When
            const event = eventFor(agg, step, now, serial++);
            const before = agg;
            agg = evolve(agg, event, now);
            now += 1000;
            // Then
            const violations = invariantViolations(agg);
            if (agg.session.rotation.length === 0) {
              reachedEmpty++;
              if (agg.clock.running) violations.push("空の輪で時計が回っている");
              if (!agg.session.isPaused) violations.push("空の輪が一時停止になっていない");
            }
            if (hasOutOfRangeIndex(event, before.session.rotation.length)) {
              sawOutOfRange++;
              expect(agg).toEqual(before);
            }
            expect(violations).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
    // 生成が #376 の入力を作れていること（作れていなければこの性質は何も突いていない）
    expect(reachedEmpty).toBeGreaterThan(0);
    expect(sawOutOfRange).toBeGreaterThan(0);
  });
});
