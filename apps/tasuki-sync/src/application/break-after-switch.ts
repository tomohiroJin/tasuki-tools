/**
 * 交代が実際に起きたコミットのあとで、休憩の条件を判定する（#402 設計 §4.1）。
 *
 * **交代の経路を数え上げない。** 手での交代・強制指名・スキップの繰り上げ・自動交代・不在の繰り上げを、
 * 「`totalSwitches` が増えたか」という 1 つの事実で覆う。並べ替え・名簿の出入り・現状維持の交代
 * （輪が 1 人・全員が不適格）では回数が増えないので、判定は走らない。
 */
import { breakPolicyOf, evolve, isBreakDue, type TimerState } from "@tasuki/timer-core";
import type { RoomState } from "./apply-room-level-event.js";
import { computeIneligibleIndices } from "./timer-snapshot-dto.js";

export function maybeBreakAfterSwitch(before: TimerState, after: RoomState, now: number): RoomState {
  const { timer, membership } = after;
  if (timer.session.totalSwitches <= before.session.totalSwitches) return after;
  if (timer.phase !== "session" || !timer.clock.running) return after;
  const policy = breakPolicyOf(timer.config);
  const eligibleSeats = timer.session.rotation.length - computeIneligibleIndices(membership, timer).size;
  const agg = { session: timer.session, clock: timer.clock };
  if (!isBreakDue(agg, policy, eligibleSeats)) return after;
  const event = policy.mode === "auto" ? ({ type: "BreakStarted", now } as const) : ({ type: "BreakSuggested", now } as const);
  const next = evolve(agg, event, now);
  return { membership, timer: { ...timer, session: next.session, clock: next.clock } };
}
