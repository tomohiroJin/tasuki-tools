/**
 * F2: 休憩でタイマー停止（v2.3 #2b）
 *
 * BreakStarted でタイマーが停止し残量が凍結、BreakEnded で凍結残量から再開すること。
 * 休憩中の経過時間は消費しない（色だけ変わって時間が進み続けるバグの修正）。
 */

import { describe, it, expect } from "vitest";
import { evolve } from "../src/evolve.js";
import { secondsLeft } from "../src/aggregate.js";
import type { Aggregate } from "../src/aggregate.js";
import { anAggregate } from "./support/aggregate-builder.js";

const NOW = 1_000_000;

/** セッション開始済みの集約を作る（7分=420秒で走行中） */
function startedAgg(): Aggregate {
  return anAggregate().withRotation("Alice", "Bob").withIntervalMinutes(7).at(NOW).running().build();
}

describe("F2: 休憩でタイマーを停止/再開する", () => {
  it("BreakStarted で running=false になり残量が凍結する", () => {
    // Given
    const started = startedAgg();
    const breakTime = NOW + 180_000; // 3分後
    // When
    const onBreak = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);
    // Then（240 付近で凍結し、休憩中は時間が経っても残量が変わらない）
    expect(onBreak.clock.running).toBe(false);
    const left = secondsLeft(onBreak.clock, breakTime);
    expect(left).toBeCloseTo(240, 0);
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
    // Given（3分後 → 残量240で凍結してから、休憩を 5 分とる）
    const started = startedAgg();
    const breakTime = NOW + 180_000;
    const onBreak = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);
    const endTime = breakTime + 300_000;
    // When
    const resumed = evolve(onBreak, { type: "BreakEnded", now: endTime }, endTime);
    // Then（再開直後は凍結残量 240 から。休憩の5分は消費されず、30秒走らせると210付近）
    expect(resumed.clock.running).toBe(true);
    expect(resumed.clock.runningSince).toBe(endTime);
    expect(resumed.clock.anchorServerTime).toBe(endTime);
    const leftAtEnd = secondsLeft(resumed.clock, endTime);
    expect(leftAtEnd).toBeCloseTo(240, 0);
    const leftRunning = secondsLeft(resumed.clock, endTime + 30_000);
    expect(leftRunning).toBeCloseTo(210, 0);
  });

  it("一時停止→休憩でも、停止中の壁時計時間を残量から引かない（冪等な凍結）", () => {
    // Given（3分後に一時停止 → 残240で凍結）
    const started = startedAgg();
    const pauseTime = NOW + 180_000;
    const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
    expect(secondsLeft(paused.clock, pauseTime)).toBeCloseTo(240, 0);
    // When（一時停止のまま 60 秒経ってから休憩を押す）
    const breakTime = pauseTime + 60_000;
    const onBreak = evolve(paused, { type: "BreakStarted", now: breakTime }, breakTime);
    // Then（60秒は引かれず 240 のまま）
    expect(onBreak.clock.running).toBe(false);
    expect(secondsLeft(onBreak.clock, breakTime)).toBeCloseTo(240, 0);
  });

  it("BreakStarted を二重に適用しても残量は変わらない（冪等）", () => {
    // Given / When
    const started = startedAgg();
    const breakTime = NOW + 180_000;
    const once = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);
    const twice = evolve(once, { type: "BreakStarted", now: breakTime + 99_999 }, breakTime + 99_999);
    // Then
    expect(secondsLeft(twice.clock, breakTime + 99_999)).toBeCloseTo(240, 0);
  });

  it("走行中に BreakEnded を適用しても何も変えない（冪等）", () => {
    const started = startedAgg();
    const out = evolve(started, { type: "BreakEnded", now: NOW + 1000 }, NOW + 1000);
    expect(out).toEqual(started);
  });

  it("一時停止中に休憩→休憩終了しても走行再開せず一時停止を維持する（running×isPaused 矛盾を防ぐ）", () => {
    // Given（一時停止で残240に凍結後、一時停止中に休憩を挟む）
    const started = startedAgg();
    const pauseTime = NOW + 180_000;
    const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
    const onBreak = evolve(paused, { type: "BreakStarted", now: pauseTime + 10_000 }, pauseTime + 10_000);
    // When（休憩終了）
    const ended = evolve(onBreak, { type: "BreakEnded", now: pauseTime + 60_000 }, pauseTime + 60_000);
    // Then（走行再開せず一時停止を維持し、残量も凍結のまま。その後 RESUME で正しく再開する）
    expect(ended.clock.running).toBe(false);
    expect(ended.session.isPaused).toBe(true);
    expect(secondsLeft(ended.clock, pauseTime + 99_999)).toBeCloseTo(240, 0);
    const resumed = evolve(ended, { type: "SessionResumed", now: pauseTime + 120_000 }, pauseTime + 120_000);
    expect(resumed.clock.running).toBe(true);
    expect(resumed.session.isPaused).toBe(false);
    expect(secondsLeft(resumed.clock, pauseTime + 120_000)).toBeCloseTo(240, 0);
  });
});
