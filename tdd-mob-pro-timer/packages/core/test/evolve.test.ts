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
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 },
      NOW + 10000,
    );
    expect(agg.session.currentIndex).toBe(1);
  });

  it("交代で現ドライバーの driverCounts が加算される", () => {
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 },
      NOW + 10000,
    );
    expect(agg.session.driverCounts[0]).toBe(1);
  });

  it("交代で totalSwitches が増加する", () => {
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: NOW + 10000 },
      NOW + 10000,
    );
    expect(agg.session.totalSwitches).toBe(1);
  });

  it("交代後 clock アンカーが更新される", () => {
    const switchTime = NOW + 10000;
    const agg = evolve(
      runningAgg,
      { type: "DriverSwitched", nextIndex: 1, now: switchTime },
      switchTime,
    );
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
    const pauseTime = NOW + 5000;
    const agg = evolve(
      runningAgg,
      { type: "SessionPaused", now: pauseTime },
      pauseTime,
    );
    expect(agg.clock.running).toBe(false);
    expect(agg.session.isPaused).toBe(true);
  });

  it("PAUSE で稼働区間が accumulatedElapsedMs に加算される（停止除外）", () => {
    const pauseTime = NOW + 5000;
    const agg = evolve(
      runningAgg,
      { type: "SessionPaused", now: pauseTime },
      pauseTime,
    );
    // runningSince = NOW - 10000, pauseTime = NOW + 5000 → +15000ms
    expect(agg.clock.accumulatedElapsedMs).toBe(5000 + 15000);
    expect(agg.clock.runningSince).toBeNull();
  });

  it("RESUME で running=true, isPaused=false になる", () => {
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
    const agg = evolve(
      pausedAgg,
      { type: "SessionResumed", now: resumeTime },
      resumeTime,
    );
    expect(agg.clock.running).toBe(true);
    expect(agg.session.isPaused).toBe(false);
    expect(agg.clock.runningSince).toBe(resumeTime);
    expect(agg.clock.anchorServerTime).toBe(resumeTime);
  });
});

describe("evolve: 不変条件（FR-008）", () => {
  it("rotation.length === driverCounts.length が常に成立する", () => {
    const agg1 = evolve(
      baseAgg,
      { type: "MemberAdded", participantId: "Dave", now: NOW },
      NOW,
    );
    expect(agg1.session.rotation.length).toBe(agg1.session.driverCounts.length);

    const agg2 = evolve(
      agg1,
      { type: "MemberRemoved", index: 0, now: NOW },
      NOW,
    );
    expect(agg2.session.rotation.length).toBe(agg2.session.driverCounts.length);
  });

  it("currentIndex は rotation.length 未満に収まる", () => {
    const agg = evolve(
      baseAgg,
      { type: "DriverSwitched", nextIndex: 0, now: NOW },
      NOW,
    );
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
    const agg = advanceDriver(runningAgg, undefined, NOW + 10000);
    expect(agg.session.currentIndex).toBe(1);
    expect(agg.session.totalSwitches).toBe(1);
    // 交代相当: タイマーが次担当でリセットされる
    expect(agg.clock.anchorServerTime).toBe(NOW + 10000);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });

  it("次が ineligible のときはスキップしてその次の eligible へ進む", () => {
    // currentIndex=0、Bob(1) が ineligible → Charlie(2) へ
    const agg = advanceDriver(runningAgg, new Set([1]), NOW + 10000);
    expect(agg.session.currentIndex).toBe(2);
  });

  it("全員 ineligible のときは現状維持しつつタイマーのみ再アンカーする（無限ループ防止）", () => {
    const agg = advanceDriver(runningAgg, new Set([0, 1, 2]), NOW + 10000);
    // 現ドライバーは維持
    expect(agg.session.currentIndex).toBe(0);
    expect(agg.session.totalSwitches).toBe(0);
    // タイマーは再アンカーされる（残り0で即再発火する無限ループを防ぐ）
    expect(agg.clock.anchorServerTime).toBe(NOW + 10000);
    expect(agg.clock.secondsLeftAtAnchor).toBe(runningAgg.clock.intervalSeconds);
  });

  it("交代後も rotation.length === driverCounts.length が保たれる", () => {
    const agg = advanceDriver(runningAgg, new Set([1]), NOW + 10000);
    expect(agg.session.rotation.length).toBe(agg.session.driverCounts.length);
  });
});
