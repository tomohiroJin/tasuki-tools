/**
 * ソロモード ローカルエンジン
 * T027: FR-031
 * WS を通らず完全ローカルで動作する。共有セッションと同一の evolve ロジックを使う。
 */

import {
  initialAggregate,
  secondsLeft,
  elapsedMs as calcElapsedMs,
  type Aggregate,
  type SessionConfig,
} from "@tdd-mob/core";
import { decide } from "@tdd-mob/core";
import { evolve } from "@tdd-mob/core";
import type { DomainEvent } from "@tdd-mob/core";

export class LocalEngine {
  private _agg: Aggregate;
  private _config: SessionConfig;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _onChange: ((agg: Aggregate) => void) | null = null;
  private _disposed = false;

  constructor(config: SessionConfig) {
    this._config = config;
    this._agg = initialAggregate(config);
  }

  get aggregate(): Aggregate {
    return this._agg;
  }

  get secondsLeft(): number {
    return secondsLeft(this._agg.clock, Date.now());
  }

  get elapsedMs(): number {
    return calcElapsedMs(this._agg.clock, Date.now());
  }

  setOnChange(cb: (agg: Aggregate) => void): void {
    this._onChange = cb;
  }

  start(): void {
    const now = Date.now();
    const result = decide(
      { command: "session.act", action: "START" },
      this._agg,
      now,
    );
    if (result.isOk()) {
      this._applyEvents(result.value, now);
      this._scheduleNextSwitch();
    }
  }

  pause(): void {
    const now = Date.now();
    const result = decide(
      { command: "session.act", action: "PAUSE" },
      this._agg,
      now,
    );
    if (result.isOk()) {
      this._clearTimer();
      this._applyEvents(result.value, now);
    }
  }

  resume(): void {
    const now = Date.now();
    const result = decide(
      { command: "session.act", action: "RESUME" },
      this._agg,
      now,
    );
    if (result.isOk()) {
      this._applyEvents(result.value, now);
      this._scheduleNextSwitch();
    }
  }

  skip(): void {
    const now = Date.now();
    const result = decide(
      { command: "session.act", action: "SWITCH" },
      this._agg,
      now,
    );
    if (result.isOk()) {
      this._clearTimer();
      this._applyEvents(result.value, now);
      this._scheduleNextSwitch();
    }
  }

  /** セッションを中断する（記録を生成しない: FR-020）。画面遷移は呼び出し側が担当。 */
  abort(): void {
    const now = Date.now();
    const result = decide({ command: "session.abort" }, this._agg, now);
    if (result.isOk()) {
      this._clearTimer();
      this._applyEvents(result.value, now);
    }
  }

  dispose(): void {
    this._disposed = true;
    this._clearTimer();
  }

  private _applyEvents(events: DomainEvent[], now: number): void {
    for (const event of events) {
      this._agg = evolve(this._agg, event, now);
    }
    this._onChange?.(this._agg);
  }

  private _scheduleNextSwitch(): void {
    if (this._disposed) return;
    this._clearTimer();

    const remaining = secondsLeft(this._agg.clock, Date.now());
    if (remaining <= 0) {
      this._autoSwitch();
      return;
    }

    this._timer = setTimeout(() => {
      this._autoSwitch();
    }, remaining * 1000);
  }

  private _autoSwitch(): void {
    if (this._disposed || !this._agg.clock.running) return;
    const now = Date.now();
    const result = decide(
      { command: "session.act", action: "SWITCH" },
      this._agg,
      now,
    );
    if (result.isOk()) {
      this._applyEvents(result.value, now);
      this._scheduleNextSwitch();
    }
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
