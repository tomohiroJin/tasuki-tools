/**
 * @deprecated ソロモードは v2 で非推奨化（入口閉鎖・App から未参照）。共有ルーム一本に統一。
 * 復活時は App.tsx のソロ経路（handleSolo/buildSoloRoom 配線）を再実装する。当面テスト維持のため残置。
 *
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
import { evolve, advanceDriver } from "@tdd-mob/core";
import type { DomainEvent } from "@tdd-mob/core";

export class LocalEngine {
  private _agg: Aggregate;
  private _config: SessionConfig;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _onChange: ((agg: Aggregate) => void) | null = null;
  private _disposed = false;
  /** ドライバー対象外（driverEligible=false）の rotation インデックス集合を返すプロバイダ */
  private _getIneligible: (() => Set<number>) | null = null;

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

  /**
   * ドライバー対象外のインデックス集合プロバイダを登録する。
   * 交代（手動 skip・自動交代）時に参照し、ineligible を飛ばして次の eligible へ進む。
   * ソロでは離脱状態が App 側（soloRosterRef）にあるため、関数で都度取得する。
   */
  setIneligibleProvider(fn: () => Set<number>): void {
    this._getIneligible = fn;
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
    if (!this._agg.clock.running) return;
    const now = Date.now();
    this._clearTimer();
    // ineligible を飛ばして次の eligible へ。交代先が無ければ advanceDriver が現状維持する。
    this._agg = advanceDriver(this._agg, this._getIneligible?.(), now);
    this._onChange?.(this._agg);
    this._scheduleNextSwitch();
  }

  /**
   * 現ドライバーが ineligible になっていれば次の eligible へ繰り上げる（共有時の handlers と整合）。
   * ロスター操作（離脱）の直後に呼び出す。稼働中のみ作用する。
   */
  reconcileCurrentDriver(): void {
    if (!this._agg.clock.running) return;
    const ineligible = this._getIneligible?.();
    if (!ineligible || !ineligible.has(this._agg.session.currentIndex)) return;
    const now = Date.now();
    this._clearTimer();
    this._agg = advanceDriver(this._agg, ineligible, now);
    this._onChange?.(this._agg);
    this._scheduleNextSwitch();
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
    // 自動交代も ineligible を飛ばす。全員 ineligible なら advanceDriver が
    // タイマーを再アンカーして現状維持し、残り0での即再発火を防ぐ。
    this._agg = advanceDriver(this._agg, this._getIneligible?.(), now);
    this._onChange?.(this._agg);
    this._scheduleNextSwitch();
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
