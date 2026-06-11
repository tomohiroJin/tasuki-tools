/**
 * F2: 休憩でタイマー停止（v2.3 #2b）
 *
 * BreakStarted でタイマーが停止し残量が凍結、BreakEnded で凍結残量から再開すること。
 * 休憩中の経過時間は消費しない（色だけ変わって時間が進み続けるバグの修正）。
 */

import { describe, it, expect } from "vitest";
import { evolve } from "../src/evolve.js";
import { initialAggregate, secondsLeft } from "../src/aggregate.js";
import type { SessionConfig, Aggregate } from "../src/aggregate.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob"],
  intervalMinutes: 7, // 420 秒
};

const NOW = 1_000_000;

/** セッション開始済みの集約を作る（7分=420秒で走行中） */
function startedAgg(): Aggregate {
  return evolve(initialAggregate(config), { type: "SessionStarted", now: NOW }, NOW);
}

describe("F2: 休憩でタイマーを停止/再開する", () => {
  it("BreakStarted で running=false になり残量が凍結する", () => {
    const started = startedAgg();
    const breakTime = NOW + 180_000; // 3分後
    const onBreak = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);

    expect(onBreak.clock.running).toBe(false);
    // 240 付近で凍結
    const left = secondsLeft(onBreak.clock, breakTime);
    expect(left).toBeCloseTo(240, 0);
    // 休憩中は時間が経っても残量が変わらない
    const leftLater = secondsLeft(onBreak.clock, breakTime + 300_000);
    expect(leftLater).toBe(left);
  });

  it("BreakStarted では isPaused は立てない（休憩は一時停止と別概念）", () => {
    const started = startedAgg();
    const breakTime = NOW + 180_000;
    const onBreak = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);
    expect(onBreak.session.isPaused).toBe(false);
  });

  it("BreakEnded で running=true になり凍結残量から再開する（休憩中の経過は消費しない）", () => {
    const started = startedAgg();
    const breakTime = NOW + 180_000; // 3分後 → 残量240で凍結
    const onBreak = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);

    // 休憩を 5 分とってから終了
    const endTime = breakTime + 300_000;
    const resumed = evolve(onBreak, { type: "BreakEnded", now: endTime }, endTime);

    expect(resumed.clock.running).toBe(true);
    expect(resumed.clock.runningSince).toBe(endTime);
    expect(resumed.clock.anchorServerTime).toBe(endTime);

    // 再開直後は凍結残量 240 から（休憩の5分は消費されない）
    const leftAtEnd = secondsLeft(resumed.clock, endTime);
    expect(leftAtEnd).toBeCloseTo(240, 0);

    // 再開から 30 秒走らせると 210 付近
    const leftRunning = secondsLeft(resumed.clock, endTime + 30_000);
    expect(leftRunning).toBeCloseTo(210, 0);
  });
});
