/**
 * サーバー権威タイマーのスケジューラテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "../src/application/schedule.js";
import { FakeClock } from "../src/adapters/system-clock.js";

/**
 * @requirements FR-003
 */
describe("Scheduler: サーバー権威タイマー", () => {
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

  it("schedule するとタイマーが1本だけ生成される", () => {
    // Given
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();

    // When
    scheduler.schedule("ROOM01", 300, onSwitch);

    // Then
    expect(vi.getTimerCount()).toBe(1);
    scheduler.clear("ROOM01");
  });

  it("残り時間経過後、onSwitch が対象ルームコード付きで発火する", () => {
    // Given
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();
    scheduler.schedule("ROOM01", 300, onSwitch);

    // When
    advance(300 * 1000 + 100);

    // Then
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onSwitch).toHaveBeenCalledWith("ROOM01");
  });

  it("clear でタイマーがキャンセルされ onSwitch は発火しない", () => {
    // Given
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();
    scheduler.schedule("ROOM01", 300, onSwitch);

    // When
    scheduler.clear("ROOM01");
    advance(300 * 1000 + 100);

    // Then
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("schedule を再度呼ぶと前のタイマーがキャンセルされる", () => {
    // Given
    const scheduler = new Scheduler(clock);
    const onSwitch = vi.fn();

    // When
    scheduler.schedule("ROOM01", 300, onSwitch);
    scheduler.schedule("ROOM01", 60, onSwitch);
    advance(60 * 1000 + 100); // 60秒後に発火

    // Then
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it("複数ルームを個別にスケジュールできる", () => {
    // Given
    const scheduler = new Scheduler(clock);
    const onSwitch1 = vi.fn();
    const onSwitch2 = vi.fn();
    scheduler.schedule("ROOM01", 60, onSwitch1);
    scheduler.schedule("ROOM02", 120, onSwitch2);

    // When
    advance(60 * 1000 + 100);

    // Then
    expect(onSwitch1).toHaveBeenCalledOnce();
    expect(onSwitch2).not.toHaveBeenCalled();

    // When（さらに進める）
    advance(60 * 1000);

    // Then
    expect(onSwitch2).toHaveBeenCalledOnce();
  });
});
