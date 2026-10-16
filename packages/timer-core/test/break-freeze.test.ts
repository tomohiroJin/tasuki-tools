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
    // Given
    const started = startedAgg();
    const breakTime = NOW + 180_000;
    // When
    const onBreak = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);
    // Then
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
    // Given
    const started = startedAgg();
    const breakTime = NOW + 180_000;
    // When
    const once = evolve(started, { type: "BreakStarted", now: breakTime }, breakTime);
    const twice = evolve(once, { type: "BreakStarted", now: breakTime + 99_999 }, breakTime + 99_999);
    // Then
    expect(secondsLeft(twice.clock, breakTime + 99_999)).toBeCloseTo(240, 0);
  });

  it("走行中に BreakEnded を適用しても何も変えない（冪等）", () => {
    // Given
    const started = startedAgg();
    // When
    const out = evolve(started, { type: "BreakEnded", now: NOW + 1000 }, NOW + 1000);
    // Then
    expect(out).toEqual(started);
  });

  it("Given 一時停止中 / When 休憩に入り、休憩を終える / Then 一時停止は解け、凍結した残りから走り出す（設計 §3.3）", () => {
    // Given（一時停止で残 240 に凍結）
    const started = startedAgg();
    const pauseTime = NOW + 180_000;
    const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
    // When
    const onBreak = evolve(paused, { type: "BreakStarted", now: pauseTime + 10_000 }, pauseTime + 10_000);
    const ended = evolve(onBreak, { type: "BreakEnded", now: pauseTime + 60_000 }, pauseTime + 60_000);
    // Then
    expect(onBreak.session.isPaused).toBe(false);
    expect(onBreak.session.break.since).toBe(pauseTime + 10_000);
    expect(ended.clock.running).toBe(true);
    expect(ended.session.break.since).toBeNull();
    expect(secondsLeft(ended.clock, pauseTime + 60_000)).toBeCloseTo(240, 0);
  });

  it("Given 走行中 / When 休憩に入る / Then 基準を今の稼働時間と交代回数で書き直し、知らせの印を消す", () => {
    // Given
    const started = startedAgg();
    const withSuggestion = evolve(started, { type: "BreakSuggested", now: NOW + 60_000 }, NOW + 60_000);
    // When
    const onBreak = evolve(withSuggestion, { type: "BreakStarted", now: NOW + 120_000 }, NOW + 120_000);
    // Then
    expect(onBreak.session.break.baseline).toEqual({
      elapsedMs: started.clock.accumulatedElapsedMs + 120_000,
      switches: started.session.totalSwitches,
    });
    expect(onBreak.session.break.suggestedAt).toBeNull();
  });

  it("Given 走行中 / When 知らせる / Then 知らせた時点の値を残し、時計は止めない", () => {
    // Given
    const started = startedAgg();
    // When
    const next = evolve(started, { type: "BreakSuggested", now: NOW + 60_000 }, NOW + 60_000);
    // Then
    expect(next.session.break.suggestedAt).toEqual({
      elapsedMs: started.clock.accumulatedElapsedMs,
      switches: started.session.totalSwitches,
    });
    expect(next.clock.running).toBe(true);
  });

  it("Given 走行中（休憩していない） / When BreakEnded / Then 何も変えない", () => {
    const started = startedAgg();
    expect(evolve(started, { type: "BreakEnded", now: NOW + 1000 }, NOW + 1000)).toEqual(started);
  });

  it.each([
    ["SessionPaused"],
    ["SessionResumed"],
    ["DriverTimerReset"],
  ] as const)(
    "Given 休憩中 / When %s（decide は出さない） / Then 集約を変えない（running を立てない・isPaused を立てない）",
    (type) => {
      // Given
      const onBreak = evolve(startedAgg(), { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
      // When
      const next = evolve(onBreak, { type, now: NOW + 2000 }, NOW + 2000);
      // Then
      expect(next).toEqual(onBreak);
      expect(next.clock.running).toBe(false);
      expect(next.session.isPaused).toBe(false);
    },
  );

  it("Given 休憩中 / When DriverSwitched / Then 集約を変えない（時計を再アンカーして走らせない）", () => {
    // Given
    const onBreak = evolve(startedAgg(), { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
    // When
    const next = evolve(onBreak, { type: "DriverSwitched", nextIndex: 1, now: NOW + 2000 }, NOW + 2000);
    // Then
    expect(next).toEqual(onBreak);
    expect(next.clock.running).toBe(false);
  });
});
