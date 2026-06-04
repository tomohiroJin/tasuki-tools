/**
 * サーバー権威タイマー スケジューラ
 * T038: FR-003, FR-007
 * 1本の setTimeout で次交代のみ待つ（1Hz TICK 廃止）
 */

import type { Clock } from "../ports/clock.js";

export type SwitchCallback = (roomCode: string) => void;

/** 1 刻みの最大待機(ms)。長い単発 setTimeout はランタイム/負荷でドリフトするため、
 * 締切まで最大この間隔で区切り、毎回壁時計から残りを再計算して待ち直す（自己補正）。 */
const MAX_TICK_MS = 1000;

export class Scheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * ルームのタイマーをスケジュールする（前のタイマーがあれば上書き）。
   * 締切の絶対時刻を固定し、自己補正チャンクで待つことで総間隔が長くても
   * タイマードリフトを累積させず、交代を締切から 1 刻み未満の精度で発火させる。
   */
  schedule(
    roomCode: string,
    secondsLeft: number,
    onSwitch: SwitchCallback,
  ): void {
    this.clear(roomCode);
    const deadline = this.clock.now() + Math.max(0, secondsLeft * 1000);
    this.armTick(roomCode, deadline, onSwitch);
  }

  /** 締切(絶対epoch)まで最大 MAX_TICK_MS 刻みで待ち、毎回壁時計から残りを再計算する。 */
  private armTick(
    roomCode: string,
    deadline: number,
    onSwitch: SwitchCallback,
  ): void {
    const remaining = deadline - this.clock.now();
    if (remaining <= 0) {
      this.timers.delete(roomCode);
      onSwitch(roomCode);
      return;
    }
    const wait = Math.min(remaining, MAX_TICK_MS);
    const timer = setTimeout(
      () => this.armTick(roomCode, deadline, onSwitch),
      wait,
    );
    this.timers.set(roomCode, timer);
  }

  /**
   * ルームのタイマーをキャンセルする
   */
  clear(roomCode: string): void {
    const timer = this.timers.get(roomCode);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(roomCode);
    }
  }

  /**
   * 全タイマーをキャンセルする（シャットダウン用）
   */
  clearAll(): void {
    for (const [code] of this.timers) {
      this.clear(code);
    }
  }
}
