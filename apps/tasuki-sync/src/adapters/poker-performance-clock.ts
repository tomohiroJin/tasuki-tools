/** MonotonicClock の実装。`performance.now()` は単調で、壁時計とは別系統である */
import type { MonotonicClock } from '../ports/poker-monotonic-clock.js';

export function createPerformanceClock(): MonotonicClock {
  return { now: () => performance.now() };
}
