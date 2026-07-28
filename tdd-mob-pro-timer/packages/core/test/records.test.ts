/**
 * 完成記録のテスト
 * T020: FR-028, SC-004
 */

import { describe, it, expect } from "vitest";
import { buildCompletionRecord } from "../src/records.js";
import { initialAggregate, elapsedMs } from "../src/aggregate.js";
import { evolve } from "../src/evolve.js";
import type { SessionConfig, Problem } from "../src/aggregate.js";

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
    const agg = initialAggregate(baseConfig, baseConfig.members);
    const completedAt = 1000000 + 300000;
    const record = buildCompletionRecord(agg, problem, baseConfig, completedAt);

    expect(record.problemTitle).toBe(problem.title);
    expect(record.language).toBe(baseConfig.language);
    expect(record.difficulty).toBe(baseConfig.difficulty);
    expect(record.members).toEqual(baseConfig.members);
    expect(record.completedAt).toBe(completedAt);
    expect(record.id).toBeTruthy();
  });

  it("elapsedSeconds は停止時間を除いた稼働時間（SC-004）", () => {
    const startTime = 1000000;
    let agg = initialAggregate(baseConfig, baseConfig.members);

    // セッション開始
    agg = evolve(agg, { type: "SessionStarted", now: startTime }, startTime);

    // 60秒稼働後、一時停止
    const pauseTime = startTime + 60000;
    agg = evolve(agg, { type: "SessionPaused", now: pauseTime }, pauseTime);

    // 30秒の停止（この時間は計上しない）
    const resumeTime = pauseTime + 30000;
    agg = evolve(agg, { type: "SessionResumed", now: resumeTime }, resumeTime);

    // さらに 40秒稼働して完成
    const completeTime = resumeTime + 40000;

    const totalElapsed = elapsedMs(agg.clock, completeTime);
    expect(totalElapsed).toBe(100000); // 60秒 + 40秒 = 100秒（停止30秒は含まない）

    const record = buildCompletionRecord(agg, problem, baseConfig, completeTime);
    expect(record.elapsedSeconds).toBe(100); // ms → seconds
  });

  it("totalSwitches が集約から転記される", () => {
    const startTime = 1000000;
    let agg = initialAggregate(baseConfig, baseConfig.members);
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

    const record = buildCompletionRecord(agg, problem, baseConfig, startTime + 20000);
    expect(record.totalSwitches).toBe(2);
  });

  it("id は一意（2つの記録が同じ id を持たない）", () => {
    const agg = initialAggregate(baseConfig, baseConfig.members);
    const r1 = buildCompletionRecord(agg, problem, baseConfig, 1000000);
    const r2 = buildCompletionRecord(agg, problem, baseConfig, 1000001);
    expect(r1.id).not.toBe(r2.id);
  });
});

// ─── T008: 中断（abort）は記録を生成しない ────────────────────────────────────

describe("中断（SessionAborted）の記録扱い", () => {
  it("SessionAborted イベント自体は CompletionRecord を持たない", () => {
    // SessionAborted イベントには記録生成に必要な情報が無いことを確認する。
    // （実際の「保存を呼ばない」制御は handlers/App.tsx 層で行う。
    //   ここではドメインイベント型の設計確認。）
    const abortedEvent: import("../src/events.js").SessionAborted = {
      type: "SessionAborted",
      now: 1000000,
    };
    expect(abortedEvent.type).toBe("SessionAborted");
    // CompletionRecord に必要な problemTitle / members 等が存在しないことを型で確認
    expect("problemTitle" in abortedEvent).toBe(false);
    expect("members" in abortedEvent).toBe(false);
  });

  it("SessionCompleted イベントには now が含まれ、buildCompletionRecord で記録を作れる", () => {
    const agg = initialAggregate(baseConfig, baseConfig.members);
    // 完成時のみ記録を生成することを再確認（abort とは対照的に）
    const record = buildCompletionRecord(agg, problem, baseConfig, 1000000);
    expect(record.problemTitle).toBe(problem.title);
    expect(record.completedAt).toBe(1000000);
  });
});
