/** 休憩明けの表示が、直前の1秒刻みの時刻を持ち越さない（#574のレビュー）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { secondsLeft, type ServerClock } from "@tasuki/timer-core/aggregate";
import { displayRemainingSeconds } from "../../src/ui/session-view.js";
import { formatRemaining } from "../../src/ui/format-time.js";
import { BREAK_TICK_MS, RUNNING_TICK_MS, useNowTick } from "../../src/ui/use-now-tick.js";

const BASE = 100_000;
// 上限300秒より下の残り290秒で、最初の表示の水増しも検出する。
const initialClock: ServerClock = {
  running: true, intervalSeconds: 300, anchorServerTime: BASE,
  secondsLeftAtAnchor: 290, accumulatedElapsedMs: 10_000, runningSince: BASE,
};

function displayedSeconds(clock: ServerClock, now: number): number {
  const label = formatRemaining(displayRemainingSeconds(clock.intervalSeconds, secondsLeft(clock, now)));
  const [minutes, seconds] = label.split(":").map(Number);
  return minutes! * 60 + seconds!;
}

describe("休憩から再開した表示の時刻", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const breakMs of [3000, 3100, 3500, 3900]) {
    for (const consumed of [0, 2]) {
      it(`${breakMs}msの休憩後、秒内100通りの位相で${consumed}秒の消費をそのまま表示する`, () => {
        // Given
        const mismatches: { phase: number; difference: number }[] = [];
        for (let phase = 0; phase < 1000; phase += 10) {
          const start = BASE + phase;
          vi.setSystemTime(start);
          const before = displayedSeconds(initialClock, start);
          const { result, rerender, unmount } = renderHook(
            ({ anchor, period }) => useNowTick(true, anchor, period),
            { initialProps: { anchor: start, period: BREAK_TICK_MS } },
          );
          // When: 実物の時刻フックを、Sessionと同じ休憩中→再開の引数で描き直す。
          act(() => vi.advanceTimersByTime(breakMs));
          const resumedAt = start + breakMs;
          rerender({ anchor: resumedAt, period: RUNNING_TICK_MS });
          const resumedClock: ServerClock = {
            ...initialClock, anchorServerTime: resumedAt, runningSince: resumedAt,
            secondsLeftAtAnchor: secondsLeft(initialClock, start) - consumed,
          };
          const difference = displayedSeconds(resumedClock, result.current) - before;
          if (difference !== -consumed) mismatches.push({ phase, difference });
          unmount();
        }
        // Then: 0秒は増減せず、2秒の不正消費は元のE2E下限 >= -1 を必ず割る。
        expect(mismatches, `${breakMs}ms / ${consumed}秒: 不一致 ${mismatches.length}/100`).toEqual([]);
      });
    }
  }
});
