/**
 * ルームのコマンドの事後処理（#366）。`decide` → `evolve` → Room レベルのイベントの適用の後に、
 * 名簿を持つこの層だけが決められる続きを行う。以前は `handleRoomCommand` の中にあった（中身は変えていない）。
 */
import { advanceDriver, rotationEntryId, type DomainEvent, type RecordIdGenerator } from "@tasuki/timer-core";
import { applyEvents, type RoomState } from "../apply-room-level-event.js";
import { computeIneligibleIndices } from "../timer-snapshot-dto.js";
import type { DomainCommandDraft } from "./domain-command.js";

export interface AfterEffectInput {
  command: DomainCommandDraft;
  /** `decide` が返したイベント列 */
  events: readonly DomainEvent[];
  /** `driver.assign` の相手（wire のコマンドの `participantId`） */
  assignTarget: string | undefined;
  now: number;
  nextRecordId: RecordIdGenerator;
}

export function applyAfterEffects(state: RoomState, input: AfterEffectInput): RoomState {
  const { command, events, now, nextRecordId } = input;

  // 現ドライバーが driver.skip で ineligible になり、かつ稼働中なら即座に次の eligible へ
  // 繰り上げる（plan.md L209）。交代先が無ければ advanceDriver が現状維持する。
  if (command.command === "driver.skip" && state.timer.clock.running) {
    const ineligible = computeIneligibleIndices(state.membership, state.timer);
    if (ineligible.has(state.timer.session.currentIndex)) {
      const advanced = advanceDriver({ session: state.timer.session, clock: state.timer.clock }, ineligible, now);
      return applyEvents(state, advanced, [], nextRecordId);
    }
    return state;
  }

  // 指名先が一時離脱中なら離脱フラグを解除して自動復帰させる（Issue #13）。
  // DriverSwitched は正確な index で評価済みのため advanceDriver 差し替えはしない。
  // 現ドライバー自身の指名は decide が no-op（空イベント）を返すため、ここは実際に交代が
  // 起きたとき（events 非空）だけ走らせる。no-op で eligible を書き換えない。
  if (command.command === "driver.assign" && events.length > 0) {
    const targetPid = input.assignTarget ?? "";
    const targetEntry = state.timer.session.rotation.find((e) => rotationEntryId(e) === targetPid);
    if (targetEntry?.eligible === false) {
      // 集約はこの時点で反映済みなので、そのまま基底として渡す（applyEvents の契約）。
      return applyEvents(
        state,
        { session: state.timer.session, clock: state.timer.clock },
        [{ type: "DriverResumed", participantId: targetPid, now }],
        nextRecordId,
      );
    }
  }
  return state;
}
