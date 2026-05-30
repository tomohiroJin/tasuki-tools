/**
 * Clock 導出関数のテスト
 * T014: FR-005, FR-006
 */

import { describe, it, expect } from "vitest";
import { secondsLeft, elapsedMs } from "../src/aggregate.js";
import type { ServerClock } from "../src/aggregate.js";

const baseClock: ServerClock = {
  running: false,
  intervalSeconds: 300,
  anchorServerTime: 1000000,
  secondsLeftAtAnchor: 300,
  accumulatedElapsedMs: 0,
  runningSince: null,
};

describe("secondsLeft: 残り時間の導出", () => {
  it("停止中は secondsLeftAtAnchor をそのまま返す", () => {
    expect(secondsLeft(baseClock, 1010000)).toBe(300);
  });

  it("稼働中は経過時間を差し引いた値を返す", () => {
    const running: ServerClock = {
      ...baseClock,
      running: true,
      anchorServerTime: 1000000,
      secondsLeftAtAnchor: 300,
      runningSince: 1000000,
    };
    // 60秒経過
    expect(secondsLeft(running, 1060000)).toBe(240);
  });

  it("残り時間は 0 を下回らない", () => {
    const running: ServerClock = {
      ...baseClock,
      running: true,
      anchorServerTime: 1000000,
      secondsLeftAtAnchor: 10,
      runningSince: 1000000,
    };
    // 60秒経過で残り-50秒 → 0
    expect(secondsLeft(running, 1060000)).toBe(0);
  });

  it("clockOffset を加算して計算する", () => {
    const running: ServerClock = {
      ...baseClock,
      running: true,
      anchorServerTime: 1000000,
      secondsLeftAtAnchor: 300,
      runningSince: 1000000,
    };
    // offset = -500ms（クライアントが少し遅れている）、実経過 = 60000 - 500 = 59500ms → 59.5s
    // Math.max(0, 300 - 59.5) = 240.5
    const result = secondsLeft(running, 1060000, -500);
    expect(result).toBeCloseTo(240.5, 1);
  });
});

describe("elapsedMs: 経過時間の導出（停止除外）FR-006", () => {
  it("停止中は accumulatedElapsedMs のみ返す", () => {
    const stopped: ServerClock = {
      ...baseClock,
      running: false,
      accumulatedElapsedMs: 5000,
      runningSince: null,
    };
    expect(elapsedMs(stopped, 1010000)).toBe(5000);
  });

  it("稼働中は accumulatedElapsedMs + 現稼働区間を返す", () => {
    const running: ServerClock = {
      ...baseClock,
      running: true,
      accumulatedElapsedMs: 5000,
      runningSince: 1000000,
    };
    // 30秒稼働
    expect(elapsedMs(running, 1030000)).toBe(5000 + 30000);
  });

  it("一時停止すると停止中の時間は含まれない（FR-006）", () => {
    // simulate: 10秒稼働 → 停止 → 5秒後でも10秒のまま
    const stoppedAfter10s: ServerClock = {
      ...baseClock,
      running: false,
      accumulatedElapsedMs: 10000,
      runningSince: null,
    };
    expect(elapsedMs(stoppedAfter10s, 1015000)).toBe(10000);
  });
});
