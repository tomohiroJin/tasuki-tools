/**
 * 進行タイマーの期限の予約（#429）。自動で次へ進む時刻（単調時計の値）に `onDue` を 1 回呼ぶ。
 *
 * timer の `Scheduler`（`schedule.ts`）とは**別のインスタンス・別の型**。同じルームコードで両方を使っても
 * 互いの予約を上書き・消去しない。**壁時計を受けない**（`MonotonicClock` だけ）。
 *
 * `Scheduler` と同じく、最大 1000ms 刻みで待ち、毎回残りを計算し直す（自己補正）。
 * 長い単発の setTimeout はドリフトするため、期限（絶対値）を固定して区切って待つ。
 */

import type { MonotonicClock } from "../ports/monotonic-clock.js";

export interface TimerPort {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AgendaDeadlines {
  /** 単調時計の `atMs` に `onDue` を呼ぶ。前の予約は上書きする。 */
  arm(roomCode: string, atMs: number, onDue: (roomCode: string) => void): void;
  clear(roomCode: string): void;
  /** 全部止める（シャットダウン用） */
  clearAll(): void;
}

/** 1 刻みの最大待機(ms)。`Scheduler` の `MAX_TICK_MS` と同じ。 */
const MAX_TICK_MS = 1000;

export function makeAgendaDeadlines(deps: { clock: MonotonicClock; timer: TimerPort }): AgendaDeadlines {
  const { clock, timer } = deps;
  const handles = new Map<string, unknown>();

  const clear = (roomCode: string): void => {
    if (!handles.has(roomCode)) return;
    timer.clear(handles.get(roomCode));
    handles.delete(roomCode);
  };

  const tick = (roomCode: string, atMs: number, onDue: (roomCode: string) => void): void => {
    const remaining = atMs - clock.now();
    if (remaining <= 0) {
      handles.delete(roomCode);
      onDue(roomCode);
      return;
    }
    handles.set(
      roomCode,
      timer.set(() => tick(roomCode, atMs, onDue), Math.min(remaining, MAX_TICK_MS)),
    );
  };

  return {
    arm(roomCode, atMs, onDue) {
      clear(roomCode);
      tick(roomCode, atMs, onDue);
    },
    clear,
    clearAll() {
      for (const code of [...handles.keys()]) clear(code);
    },
  };
}
