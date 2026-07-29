/**
 * Issue #14: 現ドライバーのまま持ち時間をやり直す（再スタート）
 *
 * session.act RESTART → DriverTimerReset。人（currentIndex）・担当回数・交代回数を
 * 変えず、タイマーだけ満タンから走り直すこと。全体リセット（SessionReset・先頭へ戻る）
 * と再開（SessionResumed・凍結残量から）との差も併せて固定する。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { decide } from "../src/decide.js";
import { evolve } from "../src/evolve.js";
import { secondsLeft, elapsedMs } from "../src/aggregate.js";
import { CommandSchema } from "../src/schemas.js";
import type { Aggregate } from "../src/aggregate.js";
import { anAggregate } from "./support/aggregate-builder.js";

const NOW = 1_000_000;

/** 開始 → 2回交代（currentIndex=2・totalSwitches=2）まで進んだ集約を作る */
function advancedAgg(): Aggregate {
  const started = anAggregate()
    .withRotation("Alice", "Bob", "Charlie")
    .withIntervalMinutes(7)
    .at(NOW)
    .running()
    .build();
  const sw1 = evolve(started, { type: "DriverSwitched", nextIndex: 1, now: NOW + 10_000 }, NOW + 10_000);
  return evolve(sw1, { type: "DriverSwitched", nextIndex: 2, now: NOW + 20_000 }, NOW + 20_000);
}

describe("decide: session.act RESTART", () => {
  it("走行中に DriverTimerReset を1件返す", () => {
    const result = decide({ command: "session.act", action: "RESTART" }, advancedAgg(), NOW + 30_000);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([{ type: "DriverTimerReset", now: NOW + 30_000 }]);
  });

  it("一時停止中でも受理する（走行再開させるため）", () => {
    const paused = evolve(advancedAgg(), { type: "SessionPaused", now: NOW + 25_000 }, NOW + 25_000);
    const result = decide({ command: "session.act", action: "RESTART" }, paused, NOW + 30_000);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(1);
  });

  it("未開始（停止中）でも受理する（RESUME と同じ寛容さ）", () => {
    const result = decide(
      { command: "session.act", action: "RESTART" },
      anAggregate().withRotation("Alice", "Bob", "Charlie").withIntervalMinutes(7).build(),
      NOW,
    );
    expect(result.isOk()).toBe(true);
  });
});

describe("evolve: DriverTimerReset", () => {
  it("currentIndex・担当回数・交代回数・rotation を変えない", () => {
    const before = advancedAgg();
    const at = NOW + 30_000;
    const after = evolve(before, { type: "DriverTimerReset", now: at }, at);

    expect(after.session.currentIndex).toBe(before.session.currentIndex); // 2
    expect(after.session.driverCounts).toEqual(before.session.driverCounts); // [1,1,0]
    expect(after.session.totalSwitches).toBe(before.session.totalSwitches); // 2
    expect(after.session.rotation).toEqual(before.session.rotation);
  });

  it("タイマーが満タンから走り直す", () => {
    const before = advancedAgg();
    const at = NOW + 30_000;
    // 再スタート直前は 420 未満まで消費されている
    expect(secondsLeft(before.clock, at)).toBeLessThan(420);

    const after = evolve(before, { type: "DriverTimerReset", now: at }, at);
    expect(after.clock.running).toBe(true);
    expect(after.clock.anchorServerTime).toBe(at);
    expect(after.clock.runningSince).toBe(at);
    expect(after.clock.secondsLeftAtAnchor).toBe(420);
    expect(secondsLeft(after.clock, at)).toBeCloseTo(420, 0);
    // 走行しているので時間が進む
    expect(secondsLeft(after.clock, at + 60_000)).toBeCloseTo(360, 0);
  });

  it("一時停止中に実行すると走行再開する（isPaused 解除）", () => {
    const paused = evolve(advancedAgg(), { type: "SessionPaused", now: NOW + 25_000 }, NOW + 25_000);
    expect(paused.session.isPaused).toBe(true);
    expect(paused.clock.running).toBe(false);

    const at = NOW + 30_000;
    const after = evolve(paused, { type: "DriverTimerReset", now: at }, at);
    expect(after.session.isPaused).toBe(false);
    expect(after.clock.running).toBe(true);
    expect(secondsLeft(after.clock, at)).toBeCloseTo(420, 0);
    // 停止していた 5 秒は消費しない（満タンから走る）
    expect(secondsLeft(after.clock, at + 10_000)).toBeCloseTo(410, 0);
  });

  it("セッション経過時間を巻き戻さない（実走時間の記録は保つ）", () => {
    const before = advancedAgg();
    const at = NOW + 30_000;
    const elapsedBefore = elapsedMs(before.clock, at);
    const after = evolve(before, { type: "DriverTimerReset", now: at }, at);

    expect(elapsedMs(after.clock, at)).toBeCloseTo(elapsedBefore, 0);
    expect(elapsedMs(after.clock, at + 5_000)).toBeCloseTo(elapsedBefore + 5_000, 0);
  });

  it("交代間隔（intervalSeconds）は変えない", () => {
    const at = NOW + 30_000;
    const after = evolve(advancedAgg(), { type: "DriverTimerReset", now: at }, at);
    expect(after.clock.intervalSeconds).toBe(420);
  });

  it("全体リセット（SessionReset）とは違い先頭ドライバーへ戻さない", () => {
    const before = advancedAgg();
    const at = NOW + 30_000;
    const restarted = evolve(before, { type: "DriverTimerReset", now: at }, at);
    const reset = evolve(before, { type: "SessionReset", now: at }, at);

    expect(restarted.session.currentIndex).toBe(2);
    expect(reset.session.currentIndex).toBe(0);
    expect(restarted.session.totalSwitches).toBe(2);
    expect(reset.session.totalSwitches).toBe(0);
  });

  it("再開（SessionResumed）とは違い凍結残量ではなく満タンから走る", () => {
    const paused = evolve(advancedAgg(), { type: "SessionPaused", now: NOW + 25_000 }, NOW + 25_000);
    const at = NOW + 30_000;
    const resumed = evolve(paused, { type: "SessionResumed", now: at }, at);
    const restarted = evolve(paused, { type: "DriverTimerReset", now: at }, at);

    expect(secondsLeft(resumed.clock, at)).toBeLessThan(420);
    expect(secondsLeft(restarted.clock, at)).toBeCloseTo(420, 0);
  });
});

describe("wire スキーマ: session.act RESTART", () => {
  it("action=RESTART のコマンドを受理する", () => {
    const parsed = v.safeParse(CommandSchema, { command: "session.act", action: "RESTART" });
    expect(parsed.success).toBe(true);
  });

  it("未知の action は拒否する", () => {
    const parsed = v.safeParse(CommandSchema, { command: "session.act", action: "REBOOT" });
    expect(parsed.success).toBe(false);
  });
});
