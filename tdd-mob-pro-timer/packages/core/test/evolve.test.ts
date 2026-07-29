/**
 * evolve 関数のテスト
 * T012: FR-003, FR-007, FR-008
 */

import { describe, it, expect } from "vitest";
import { evolve, advanceDriver } from "../src/evolve.js";
import { anAggregate } from "./support/aggregate-builder.js";

const baseAgg = anAggregate().build();
const NOW = 1000000;

describe("evolve: SessionStarted", () => {
  it("セッション開始で clock.running=true になる", () => {
    const agg = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    expect(agg.clock.running).toBe(true);
  });

  it("anchorServerTime が now に設定される", () => {
    const agg = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    expect(agg.clock.anchorServerTime).toBe(NOW);
  });

  it("runningSince が now に設定される", () => {
    const agg = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    expect(agg.clock.runningSince).toBe(NOW);
  });
});

describe("evolve: DriverSwitched", () => {
  const runningAgg = {
    ...baseAgg,
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      runningSince: NOW,
    },
  };

  it("交代でインデックスが進む", () => {
    // When
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 },
      NOW + 10000,
    );
    // Then
    expect(agg.session.currentIndex).toBe(1);
  });

  it("交代で現ドライバーの driverCounts が加算される", () => {
    // When
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 },
      NOW + 10000,
    );
    // Then
    expect(agg.session.driverCounts[0]).toBe(1);
  });

  it("交代で totalSwitches が増加する", () => {
    // When
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 },
      NOW + 10000,
    );
    // Then
    expect(agg.session.totalSwitches).toBe(1);
  });

  it("交代後 clock アンカーが更新される", () => {
    // Given
    const switchTime = NOW + 10000;
    // When
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: switchTime },
      switchTime,
    );
    // Then
    expect(agg.clock.anchorServerTime).toBe(switchTime);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });
});

describe("evolve: SessionPaused / SessionResumed", () => {
  const runningAgg = {
    ...baseAgg,
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 5000,
      runningSince: NOW - 10000,
    },
  };

  it("PAUSE で running=false, isPaused=true になる", () => {
    // Given
    const pauseTime = NOW + 5000;
    // When
    const agg = evolve(
      runningAgg,
      { type: "SessionPaused", now: pauseTime },
      pauseTime,
    );
    // Then
    expect(agg.clock.running).toBe(false);
    expect(agg.session.isPaused).toBe(true);
  });

  it("PAUSE で稼働区間が accumulatedElapsedMs に加算される（停止除外）", () => {
    // Given
    const pauseTime = NOW + 5000;
    // When
    const agg = evolve(
      runningAgg,
      { type: "SessionPaused", now: pauseTime },
      pauseTime,
    );
    // Then（runningSince = NOW - 10000, pauseTime = NOW + 5000 → +15000ms）
    expect(agg.clock.accumulatedElapsedMs).toBe(5000 + 15000);
    expect(agg.clock.runningSince).toBeNull();
  });

  it("RESUME で running=true, isPaused=false になる", () => {
    // Given
    const pausedAgg = {
      ...baseAgg,
      session: { ...baseAgg.session, isPaused: true },
      clock: {
        ...baseAgg.clock,
        running: false,
        secondsLeftAtAnchor: 250,
        runningSince: null,
      },
    };
    const resumeTime = NOW + 20000;
    // When
    const agg = evolve(
      pausedAgg,
      { type: "SessionResumed", now: resumeTime },
      resumeTime,
    );
    // Then
    expect(agg.clock.running).toBe(true);
    expect(agg.session.isPaused).toBe(false);
    expect(agg.clock.runningSince).toBe(resumeTime);
    expect(agg.clock.anchorServerTime).toBe(resumeTime);
  });
});

/**
 * @requirements FR-008
 */
describe("evolve: 不変条件", () => {
  it("rotation.length === driverCounts.length が常に成立する", () => {
    // When（メンバー追加 → 削除の順で操作する）
    const agg1 = evolve(
      baseAgg,
      { type: "MemberAdded", participantId: "Dave", now: NOW },
      NOW,
    );
    const agg2 = evolve(
      agg1,
      { type: "MemberRemoved", index: 0, now: NOW },
      NOW,
    );
    // Then（各操作後に不変条件を確認する）
    expect(agg1.session.rotation.length).toBe(agg1.session.driverCounts.length);
    expect(agg2.session.rotation.length).toBe(agg2.session.driverCounts.length);
  });

  it("currentIndex は rotation.length 未満に収まる", () => {
    // When
    const agg = evolve(
      baseAgg,
      { type: "DriverSwitched", nextIndex: 0, now: NOW },
      NOW,
    );
    // Then
    expect(agg.session.currentIndex).toBeLessThan(agg.session.rotation.length);
  });
});

// ─── advanceDriver（eligible を尊重する交代ヘルパ）──────────────────────────────
describe("advanceDriver: ineligible を飛ばす交代（plan.md L194/L209）", () => {
  const runningAgg = {
    ...baseAgg,
    clock: {
      ...baseAgg.clock,
      running: true,
      anchorServerTime: NOW,
      secondsLeftAtAnchor: 300,
      runningSince: NOW,
    },
  };

  it("全員 eligible のときは次のインデックスへ進み交代相当になる", () => {
    // When
    const agg = advanceDriver(runningAgg, undefined, NOW + 10000);
    // Then（交代相当: タイマーが次担当でリセットされる）
    expect(agg.session.currentIndex).toBe(1);
    expect(agg.session.totalSwitches).toBe(1);
    expect(agg.clock.anchorServerTime).toBe(NOW + 10000);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });

  it("次が ineligible のときはスキップしてその次の eligible へ進む", () => {
    // When（currentIndex=0、Bob(1) が ineligible → Charlie(2) へ）
    const agg = advanceDriver(runningAgg, new Set([1]), NOW + 10000);
    // Then
    expect(agg.session.currentIndex).toBe(2);
  });

  it("全員 ineligible のときは現状維持しつつタイマーのみ再アンカーする（無限ループ防止）", () => {
    // When
    const agg = advanceDriver(runningAgg, new Set([0, 1, 2]), NOW + 10000);
    // Then（現ドライバーは維持しつつ、残り0で即再発火する無限ループを防ぐためタイマーは再アンカーされる）
    expect(agg.session.currentIndex).toBe(0);
    expect(agg.session.totalSwitches).toBe(0);
    expect(agg.clock.anchorServerTime).toBe(NOW + 10000);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });

  it("交代後も rotation.length === driverCounts.length が保たれる", () => {
    const agg = advanceDriver(runningAgg, new Set([1]), NOW + 10000);
    expect(agg.session.rotation.length).toBe(agg.session.driverCounts.length);
  });
});
