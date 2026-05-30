/**
 * サーバー権威タイマー スケジューラ
 * T038: FR-003, FR-007
 * 1本の setTimeout で次交代のみ待つ（1Hz TICK 廃止）
 */

import type { Clock } from "../ports/clock.js";

export type SwitchCallback = (roomCode: string) => void;

export class Scheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * ルームのタイマーをスケジュールする
   * 前のタイマーがあれば上書きする
   */
  schedule(
    roomCode: string,
    secondsLeft: number,
    onSwitch: SwitchCallback,
  ): void {
    this.clear(roomCode);

    const ms = Math.max(0, secondsLeft * 1000);
    const timer = setTimeout(() => {
      this.timers.delete(roomCode);
      onSwitch(roomCode);
    }, ms);

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
