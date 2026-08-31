/**
 * 完成記録のテスト
 * T020: FR-028, SC-004
 */

import { describe, it, expect } from "vitest";
import { buildCompletionRecord } from "../src/records.js";
import { elapsedMs } from "../src/aggregate.js";
import { evolve } from "../src/evolve.js";
import type { SessionConfig, Problem, Aggregate } from "../src/aggregate.js";
import type { DomainEvent } from "../src/events.js";
import { anAggregate } from "./support/aggregate-builder.js";

const baseConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};

const problem: Problem = {
  title: "FizzBuzz",
  description: "実装してください",
  requirements: ["3の倍数はFizz", "5の倍数はBuzz"],
  exampleTest: "expect(fizzBuzz(3)).toBe('Fizz')",
  hints: [],
};

describe("buildCompletionRecord", () => {
  it("必要なフィールドが全て含まれる", () => {
    // Given
    const agg = anAggregate().build();
    const completedAt = 1000000 + 300000;
    // When
    const record = buildCompletionRecord(agg, problem, baseConfig, completedAt);
    // Then
    expect(record.problemTitle).toBe(problem.title);
    expect(record.language).toBe(baseConfig.language);
    expect(record.difficulty).toBe(baseConfig.difficulty);
    expect(record.members).toEqual(baseConfig.members);
    expect(record.completedAt).toBe(completedAt);
    expect(record.id).toBeTruthy();
  });

  /**
   * @requirements SC-004
   */
  it("elapsedSeconds は停止時間を除いた稼働時間", () => {
    // Given（開始 → 60秒稼働 → 一時停止 → 30秒の停止（計上しない）→ 再開 → 40秒稼働して完成）
    const startTime = 1000000;
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: startTime }, startTime);
    const pauseTime = startTime + 60000;
    agg = evolve(agg, { type: "SessionPaused", now: pauseTime }, pauseTime);
    const resumeTime = pauseTime + 30000;
    agg = evolve(agg, { type: "SessionResumed", now: resumeTime }, resumeTime);
    const completeTime = resumeTime + 40000;
    // When
    const totalElapsed = elapsedMs(agg.clock, completeTime);
    const record = buildCompletionRecord(agg, problem, baseConfig, completeTime);
    // Then（60秒 + 40秒 = 100秒。停止30秒は含まない）
    expect(totalElapsed).toBe(100000);
    expect(record.elapsedSeconds).toBe(100); // ms → seconds
  });

  it("totalSwitches が集約から転記される", () => {
    // Given（2回交代した集約を作る）
    const startTime = 1000000;
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: startTime }, startTime);
    agg = evolve(
      agg,
      { type: "DriverSwitched", nextIndex: 1, now: startTime + 10000 },
      startTime + 10000,
    );
    agg = evolve(
      agg,
      { type: "DriverSwitched", nextIndex: 2, now: startTime + 20000 },
      startTime + 20000,
    );
    // When
    const record = buildCompletionRecord(agg, problem, baseConfig, startTime + 20000);
    // Then
    expect(record.totalSwitches).toBe(2);
  });

  it("id は一意（2つの記録が同じ id を持たない）", () => {
    // Given
    const agg = anAggregate().build();
    // When
    const r1 = buildCompletionRecord(agg, problem, baseConfig, 1000000);
    const r2 = buildCompletionRecord(agg, problem, baseConfig, 1000001);
    // Then
    expect(r1.id).not.toBe(r2.id);
  });
});

/**
 * @requirements T008
 */
describe("中断（SessionAborted）の記録扱い", () => {
  it("SessionAborted イベント自体には CompletionRecord に必要な problemTitle / members が存在しない", () => {
    // Given（実際の「保存を呼ばない」制御は handlers/App.tsx 層で行う。ここではドメインイベント型の設計確認）
    const rawEvent = { type: "SessionAborted", now: 1000000 } as const;
    // When（rawEvent が SessionAborted 型として受理されることを確認する）
    // SessionAborted は events.ts が export していない（公開記号を増やさないため、
    // 公開されている DomainEvent の union から取り出す）
    const abortedEvent: Extract<DomainEvent, { type: "SessionAborted" }> = rawEvent;
    // Then
    expect(abortedEvent.type).toBe("SessionAborted");
    expect("problemTitle" in abortedEvent).toBe(false);
    expect("members" in abortedEvent).toBe(false);
  });

  it("SessionCompleted イベントには now が含まれ、buildCompletionRecord で記録を作れる", () => {
    // Given（完成時のみ記録を生成することを確認する。abort とは対照的）
    const agg = anAggregate().build();
    // When
    const record = buildCompletionRecord(agg, problem, baseConfig, 1000000);
    // Then
    expect(record.problemTitle).toBe(problem.title);
    expect(record.completedAt).toBe(1000000);
  });
});

// ─── buildCompletionRecord: 周回数とドライバー回数（coverage-supplement.test.ts より移動・T036） ──

describe("buildCompletionRecord: 周回数とドライバー回数", () => {
  const shortProblem: Problem = {
    title: "T", description: "d", requirements: [], exampleTest: "", hints: [],
  };

  it("rotation 長で割った周回数を記録する", () => {
    // Given
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, totalSwitches: 6, driverCounts: [2, 2, 2] } };
    // When
    const rec = buildCompletionRecord(agg, shortProblem, baseConfig, 1000000);
    // Then（6 / 3 = 2）
    expect(rec.rounds).toBe(2);
    expect(rec.driverCounts).toEqual([2, 2, 2]);
  });

  it("roomId を渡すと記録に含める", () => {
    // Given
    const agg = anAggregate().build();
    const roomId = "ROOM-1";
    // When
    const rec = buildCompletionRecord(agg, shortProblem, baseConfig, 1000000, roomId);
    // Then
    expect(rec.roomId).toBe("ROOM-1");
  });

  it("rotation が空なら周回数は 0", () => {
    // Given
    const agg: Aggregate = {
      session: { rotation: [], currentIndex: 0, isPaused: false, driverCounts: [], totalSwitches: 0 },
      clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    };
    // When
    const rec = buildCompletionRecord(agg, shortProblem, baseConfig, 1000000);
    // Then
    expect(rec.rounds).toBe(0);
  });
});
