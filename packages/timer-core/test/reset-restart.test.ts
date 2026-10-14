/**
 * F3: リセット=最初から再スタート（v2.3 #3）
 *
 * SessionReset でローテーション・カウント・タイマーが初期化され、かつ走行状態で
 * 再スタートすること。以前は停止状態に戻り「後から開始できない詰み」になっていた。
 */

import { describe, it, expect } from "vitest";
import { evolve } from "../src/evolve.js";
import { secondsLeft } from "../src/aggregate.js";
import type { Aggregate } from "../src/aggregate.js";
import { anAggregate } from "./support/aggregate-builder.js";

const NOW = 1_000_000;

/** セッション開始済みの集約を作る */
function startedAgg(): Aggregate {
  return anAggregate().withRotation("Alice", "Bob", "Charlie").withIntervalMinutes(7).at(NOW).running().build();
}

describe("F3: リセットを最初から再スタートにする", () => {
  it("DriverSwitched で進めた後 SessionReset すると currentIndex/カウント/交代回数が初期化される", () => {
    // Given（2回交代して進める）
    const started = startedAgg();
    const sw1 = evolve(started, { type: "DriverSwitched", nextIndex: 1, now: NOW + 10_000 }, NOW + 10_000);
    const sw2 = evolve(sw1, { type: "DriverSwitched", nextIndex: 2, now: NOW + 20_000 }, NOW + 20_000);
    expect(sw2.session.currentIndex).toBe(2);
    expect(sw2.session.totalSwitches).toBe(2);
    // When
    const resetTime = NOW + 30_000;
    const reset = evolve(sw2, { type: "SessionReset", now: resetTime }, resetTime);
    // Then
    expect(reset.session.currentIndex).toBe(0);
    expect(reset.session.driverCounts).toEqual([0, 0, 0]);
    expect(reset.session.totalSwitches).toBe(0);
  });

  it("SessionReset 後は clock.running=true で残量が満タン(420付近)に戻る", () => {
    // Given
    const started = startedAgg();
    const sw1 = evolve(started, { type: "DriverSwitched", nextIndex: 1, now: NOW + 10_000 }, NOW + 10_000);
    // When
    const resetTime = NOW + 30_000;
    const reset = evolve(sw1, { type: "SessionReset", now: resetTime }, resetTime);
    // Then（走行中・直後は満タン420付近）
    expect(reset.clock.running).toBe(true);
    expect(reset.clock.anchorServerTime).toBe(resetTime);
    expect(reset.clock.runningSince).toBe(resetTime);
    const left = secondsLeft(reset.clock, resetTime);
    expect(left).toBeCloseTo(420, 0);
  });

  it("リセット直後から時間が進む（走行している）", () => {
    // Given
    const started = startedAgg();
    const resetTime = NOW + 30_000;
    // When
    const reset = evolve(started, { type: "SessionReset", now: resetTime }, resetTime);
    // Then（60秒走らせると 360 付近）
    const left = secondsLeft(reset.clock, resetTime + 60_000);
    expect(left).toBeCloseTo(360, 0);
  });

  it("Given 7 分で 2 回交代した集約 / When SessionReset / Then 集約の全体が満タン・走行・並び順そのままの初期値になる（#364 の特性テスト）", () => {
    // #364 で、リセットが分を経由せずに秒のまま初期の集約を組むようになった。値が 1 つも変わらないことを固定する。
    // Given
    const started = startedAgg();
    const sw1 = evolve(started, { type: "DriverSwitched", nextIndex: 1, now: NOW + 10_000 }, NOW + 10_000);
    const sw2 = evolve(sw1, { type: "DriverSwitched", nextIndex: 2, now: NOW + 20_000 }, NOW + 20_000);
    const resetTime = NOW + 30_000;
    // When
    const reset = evolve(sw2, { type: "SessionReset", now: resetTime }, resetTime);
    // Then
    expect(reset).toEqual({
      session: {
        rotation: sw2.session.rotation,
        currentIndex: 0,
        isPaused: false,
        driverCounts: [0, 0, 0],
        totalSwitches: 0,
        // 2 回交代していても、リセットで直前のドライバーは居なくなる（#374）
        previousDriverId: null,
      },
      clock: {
        running: true,
        intervalSeconds: 420,
        anchorServerTime: resetTime,
        secondsLeftAtAnchor: 420,
        accumulatedElapsedMs: 0,
        runningSince: resetTime,
      },
    });
  });
});
