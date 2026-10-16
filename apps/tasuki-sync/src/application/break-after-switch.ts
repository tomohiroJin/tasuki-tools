/**
 * 交代の切れ目が来たコミットのあとで、休憩の条件を判定する（#402 設計 §4.1）。
 *
 * **交代の経路を数え上げない。** 手での交代・強制指名・スキップの繰り上げ・自動交代・不在の繰り上げを、
 * 「交代の切れ目が来たか」という事実で覆う。切れ目は次のどちらか。
 *
 * - `totalSwitches` が増えた（実際に運転者が替わった）
 * - 時計が走っていて `accumulatedElapsedMs` が増えた（交代の再アンカー・やり直しで稼働時間を確定した）。
 *   輪が 1 人・他が全員不適格の**現状維持の交代**は回数を増やさないが、時計は再アンカーする。
 *   ここを入口から外すと、1 人の輪では経過時間の条件でも休憩が来なかった（PR #416 のレビュー）
 *
 * 一時停止・休憩・ロビーへの戻りは時計を止めるので、後者に入らない。並べ替え・名簿の出入り・メモの更新は
 * どちらも動かさないので、判定は走らない（交代の無いコミットで休憩に入らない。変異 m294）。
 */
import { breakPolicyOf, evolve, isBreakDue, type TimerState } from "@tasuki/timer-core";
import type { RoomState } from "./apply-room-level-event.js";
import { computeIneligibleIndices } from "./timer-snapshot-dto.js";

/** 交代の切れ目が来たか（運転者が替わった、または走ったまま稼働時間を確定した）。 */
function reachedSwitchBoundary(before: TimerState, after: TimerState): boolean {
  if (after.session.totalSwitches > before.session.totalSwitches) return true;
  return after.clock.running && after.clock.accumulatedElapsedMs > before.clock.accumulatedElapsedMs;
}

export function maybeBreakAfterSwitch(before: TimerState, after: RoomState, now: number): RoomState {
  const { timer, membership } = after;
  if (!reachedSwitchBoundary(before, timer)) return after;
  if (timer.phase !== "session" || !timer.clock.running) return after;
  const policy = breakPolicyOf(timer.config);
  // 条件「なし」では判定しない。適格な席の数（名簿の走査）は周回の条件だけが読むので、その時だけ数える
  if (policy.trigger === "none") return after;
  const eligibleSeats =
    policy.trigger === "rounds" ? timer.session.rotation.length - computeIneligibleIndices(membership, timer).size : 0;
  const agg = { session: timer.session, clock: timer.clock };
  if (!isBreakDue(agg, policy, eligibleSeats)) return after;
  const event = policy.mode === "auto" ? ({ type: "BreakStarted", now } as const) : ({ type: "BreakSuggested", now } as const);
  const next = evolve(agg, event, now);
  return { membership, timer: { ...timer, session: next.session, clock: next.clock } };
}
