/**
 * 自動交代のスケジュールを、ルームの clock の状態に合わせる（FR-003）。#366 で `handlers.ts` の
 * `makeHandlers` から出した（中身は変えていない）。
 *
 * - `reconcileSchedule`: 稼働中で完成フェーズでなければ、次の交代を予約する。そうでなければ解除する
 * - `autoSwitch`: 予約の時刻が来たら、サーバーの側で交代し、予約し直す。ドライバー不在の猶予の後の
 *   繰り上げ（presence の不在タイマー・R2-1）も同じ処理を呼ぶ
 */
import { advanceDriver, secondsLeft, type TimerState } from "@tasuki/timer-core";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { WallClock } from "../ports/wall-clock.js";
import type { RoomState } from "./apply-room-level-event.js";
import type { Scheduler } from "./schedule.js";
import { computeIneligibleIndices, rotationDisplayNames } from "./timer-snapshot-dto.js";

export interface ScheduleSyncDeps {
  /** 無ければ予約しない（テストの組み立て） */
  scheduler: Scheduler | undefined;
  clock: WallClock;
  broadcaster: Pick<Broadcaster, "broadcastSignal">;
  loadState: (roomCode: string) => RoomState | undefined;
  commit: (state: RoomState) => void;
}

export interface ScheduleSync {
  reconcileSchedule(room: TimerState): void;
  autoSwitch(roomCode: string): void;
}

export function createScheduleSync(deps: ScheduleSyncDeps): ScheduleSync {
  const { scheduler, clock, broadcaster, loadState, commit } = deps;

  /** ルームの clock 状態に応じて次回自動交代をスケジュール/解除する（FR-003） */
  function reconcileSchedule(room: TimerState): void {
    if (!scheduler) return;
    // 稼働中かつ完成フェーズに入っていない場合のみ次回交代を予約する。
    //
    // かつてここには `!room.onBreak` という到達不能なガードがあった（Issue #28・T080・FR-119）。
    // v2.10 で休憩機能の UI とコマンドを撤去した際、`buildDomainCommand` の switch から
    // `break.start` / `break.end` の case が消え、以後この 2 コマンドは `default:` に落ちて
    // `UNKNOWN_COMMAND` になる。つまり `BreakStarted` イベントは生成されず、
    // **`room.onBreak` が true になる経路が存在しない**ため `!room.onBreak` は常に真だった。
    //
    // wire スキーマ（`schemas.ts` の `break.start` / `break.end`）と `Room.onBreak`
    // フィールドは**残す**（FR-089: 受理側の後方互換 / snapshot の形を変えない）。
    // 撤去したのは、この到達しない条件だけである。
    if (room.clock.running && room.phase !== "celebration") {
      const left = secondsLeft(room.clock, clock.now());
      scheduler.schedule(room.code, left, autoSwitch);
    } else {
      scheduler.clear(room.code);
    }
  }

  /** タイマー発火時にサーバー側で交代を実行し再スケジュールする。
   *  driverEligible=false の参加者を飛ばし、全員 ineligible なら現状維持する（plan.md L194）。 */
  function autoSwitch(roomCode: string): void {
    const state = loadState(roomCode);
    if (!state || !state.timer.clock.running) return;
    const { membership, timer } = state;
    const now = clock.now();
    const agg = { session: timer.session, clock: timer.clock };
    const newAgg = advanceDriver(agg, computeIneligibleIndices(membership, timer), now);
    const updated: TimerState = { ...timer, session: newAgg.session, clock: newAgg.clock };
    commit({ membership, timer: updated });
    broadcaster.broadcastSignal(updated.code, {
      type: "signal",
      signal: "switch",
      nextDriverName: rotationDisplayNames(membership, updated)[updated.session.currentIndex] ?? "",
    });
    reconcileSchedule(updated);
  }

  return { reconcileSchedule, autoSwitch };
}
