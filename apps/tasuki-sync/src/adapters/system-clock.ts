/**
 * SystemClock — 実際のシステム時刻を返す Clock 実装
 */

import type { Clock } from "../ports/clock.js";

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** テスト用フェイクClock */
export class FakeClock implements Clock {
  private _now: number;

  constructor(initial = 1000000) {
    this._now = initial;
  }

  now(): number {
    return this._now;
  }

  advance(ms: number): void {
    this._now += ms;
  }

  set(ms: number): void {
    this._now = ms;
  }
}
