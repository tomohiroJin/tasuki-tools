/**
 * F1: 一時停止の残量凍結（v2.3 #2a）
 *
 * 一時停止を押した時点の残量を凍結し、停止中は時間が経っても変わらないことを検証する。
 * （以前は満タンに戻ってしまうバグがあった。）
 */

import { describe, it, expect } from "vitest";
import { secondsLeft } from "../src/aggregate.js";
import { evolve } from "../src/evolve.js";
import type { Aggregate } from "../src/aggregate.js";
import { anAggregate } from "./support/aggregate-builder.js";

const NOW = 1_000_000;

/** セッション開始済みの集約を作る（7分=420秒で走行中） */
function startedAgg(): Aggregate {
  return anAggregate().withRotation("Alice", "Bob").withIntervalMinutes(7).at(NOW).running().build();
}

describe("F1: 一時停止で残量を凍結する", () => {
  it("7分開始→3分後に一時停止すると、停止中の残量が満タン420でなく240付近で凍結する", () => {
    // Given
    const started = startedAgg();
    const pauseTime = NOW + 180_000; // 3分後
    // When
    const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
    // Then（停止中は secondsLeft が secondsLeftAtAnchor をそのまま返す。240付近で凍結し満タンに戻らない）
    expect(paused.clock.running).toBe(false);
    const left = secondsLeft(paused.clock, pauseTime);
    expect(left).toBeCloseTo(240, 0);
    expect(left).not.toBeCloseTo(420, 0);
  });

  it("停止中は時間が経っても残量が変わらない（凍結）", () => {
    // Given
    const started = startedAgg();
    const pauseTime = NOW + 180_000; // 3分後
    const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
    // When（停止のまま 5 分経過させる）
    const leftAtPause = secondsLeft(paused.clock, pauseTime);
    const leftLater = secondsLeft(paused.clock, pauseTime + 300_000);
    // Then（残量は同じで 240 付近のまま）
    expect(leftLater).toBe(leftAtPause);
    expect(leftLater).toBeCloseTo(240, 0);
  });

  it("再開後も240付近から継続する（満タンに戻らない）", () => {
    // Given
    const started = startedAgg();
    const pauseTime = NOW + 180_000; // 3分後
    const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
    // When（2分後に再開）
    const resumeTime = pauseTime + 120_000;
    const resumed = evolve(paused, { type: "SessionResumed", now: resumeTime }, resumeTime);
    // Then（再開直後は 240 付近から継続し、30 秒走らせると 210 付近になる）
    expect(resumed.clock.running).toBe(true);
    const leftAtResume = secondsLeft(resumed.clock, resumeTime);
    expect(leftAtResume).toBeCloseTo(240, 0);
    const leftRunning = secondsLeft(resumed.clock, resumeTime + 30_000);
    expect(leftRunning).toBeCloseTo(210, 0);
  });
});
