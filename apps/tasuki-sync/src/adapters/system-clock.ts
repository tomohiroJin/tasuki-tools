/**
 * SystemWallClock — 実際のシステム時刻を返す WallClock 実装
 */

import type { WallClock } from "../ports/wall-clock.js";

export class SystemWallClock implements WallClock {
  now(): number {
    return Date.now();
  }
}

/** テスト用フェイクWallClock */
export class FakeClock implements WallClock {
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
