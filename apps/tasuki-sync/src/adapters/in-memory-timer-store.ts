/**
 * InMemoryTimerStore — timer の状態の揮発インメモリストア（#95 S4a）。
 */

import type { TimerState } from "@tasuki/timer-core";
import type { TimerStore } from "../ports/timer-store.js";

export class InMemoryTimerStore implements TimerStore {
  private readonly timers = new Map<string, TimerState>();

  get(code: string): TimerState | undefined {
    return this.timers.get(code);
  }

  put(state: TimerState): void {
    this.timers.set(state.code, state);
  }

  remove(code: string): void {
    this.timers.delete(code);
  }

  list(): TimerState[] {
    return [...this.timers.values()];
  }
}
