/**
 * サーバー権威タイマーのスケジューラテスト
 * T037: FR-003
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "../src/application/schedule.js";
import { FakeClock } from "../src/adapters/system-clock.js";

describe("Scheduler: サーバー権威タイマー（FR-003）", () => {
  let clock: FakeClock;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new FakeClock(1000000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 自己補正スケジューラは毎刻み clock.now() を読むため、テストでも時計とタイマーを
   *  同期させて進める（本番の Date.now() は実時間で進むのと同じ）。刻み <= MAX_TICK_MS。 */
  const advance = (ms: number): void => {
    const STEP = 100;
    let remaining = ms;
    while (remaining > 0) {
      const step = Math.min(STEP, remaining);
      clock.advance(step);
      vi.advanceTimersByTime(step);
      remaining -= step;
    }
  };

  it("schedule で setTimeout が1本設定される", () => {
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();

    scheduler.schedule("ROOM01", 300, onSwitch);

    expect(vi.getTimerCount()).toBe(1);
    scheduler.clear("ROOM01");
  });

  it("残り時間経過後に onSwitch が呼ばれる", () => {
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();

    scheduler.schedule("ROOM01", 300, onSwitch);
    advance(300 * 1000 + 100);

    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onSwitch).toHaveBeenCalledWith("ROOM01");
  });

  it("clear でタイマーがキャンセルされ onSwitch が呼ばれない", () => {
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();

    scheduler.schedule("ROOM01", 300, onSwitch);
    scheduler.clear("ROOM01");

    advance(300 * 1000 + 100);

    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("schedule を再度呼ぶと前のタイマーがキャンセルされる", () => {
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();

    scheduler.schedule("ROOM01", 300, onSwitch);
    scheduler.schedule("ROOM01", 60, onSwitch);

    // 60秒後に発火
    advance(60 * 1000 + 100);
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it("複数ルームを個別にスケジュールできる", () => {
    const scheduler = new Scheduler(clock);
    const onSwitch1 = vi.fn();
    const onSwitch2 = vi.fn();

    scheduler.schedule("ROOM01", 60, onSwitch1);
    scheduler.schedule("ROOM02", 120, onSwitch2);

    advance(60 * 1000 + 100);
    expect(onSwitch1).toHaveBeenCalledOnce();
    expect(onSwitch2).not.toHaveBeenCalled();

    advance(60 * 1000);
    expect(onSwitch2).toHaveBeenCalledOnce();
  });
});
