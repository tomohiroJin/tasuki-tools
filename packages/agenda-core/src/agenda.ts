/**
 * 進行タイマーの状態の遷移（#429 spec §4.6）。
 *
 * **表現は直接遷移関数＋`Result`**（ルーレットの `roulette.ts` と同じ）。時計は引数で受ける（ドメインは環境を読まない）。
 * **状態が変わらないときは同じ参照を `ok` で返す**。同期サーバーは参照の比較で「配るか」を決める。
 */
import { err, ok, type Result } from "neverthrow";
import type { AgendaError } from "./errors.js";
import { MAX_STEP_BUDGET_SEC } from "./limits.js";
import { expand } from "./scenario.js";
import type { AgendaState, PlannedStep, ScenarioInput } from "./types.js";

export const INITIAL_AGENDA_STATE: AgendaState = {
  phase: "idle",
  title: "",
  steps: [],
  currentId: null,
  startedAt: null,
  stepStartedAt: null,
  runningSince: null,
  accumulatedMs: 0,
  finishedAtMs: null,
};

type R<C extends AgendaError["code"] = never> = Result<AgendaState, AgendaError<C>>;

const fail = <C extends AgendaError["code"]>(code: C): Result<never, AgendaError<C>> => err({ code });

/** シナリオを置き換える。idle のときだけ。 */
export function replaceScenario(
  s: AgendaState,
  input: ScenarioInput,
): R<"AGENDA_IN_PROGRESS" | "AGENDA_FINISHED" | "INVALID_SCENARIO"> {
  if (s.phase === "running" || s.phase === "paused") return fail("AGENDA_IN_PROGRESS");
  if (s.phase === "finished") return fail("AGENDA_FINISHED");
  // 境界で検証済みの入力を前提にする。ドメイン側の守りは空の区切りだけ
  if (input.steps.length === 0) return fail("INVALID_SCENARIO");
  return ok({ ...INITIAL_AGENDA_STATE, title: input.title, steps: expand(input) });
}

/** 開始する。最初の区切りが始まる。 */
export function start(s: AgendaState, now: number): R<"AGENDA_EMPTY" | "AGENDA_ALREADY_STARTED"> {
  if (s.phase !== "idle") return fail("AGENDA_ALREADY_STARTED");
  const first = s.steps[0];
  if (first === undefined) return fail("AGENDA_EMPTY");
  return ok({
    ...s,
    phase: "running",
    currentId: first.id,
    startedAt: now,
    stepStartedAt: now,
    runningSince: now,
    accumulatedMs: 0,
    finishedAtMs: null,
  });
}

/** 次の区切りへ進む。区切り ID が違えば何もしない（古い押下を捨てる）。一時停止中なら次は動いて始まる。 */
export function next(s: AgendaState, input: { stepId: string; now: number }): R<"AGENDA_NOT_STARTED"> {
  if (s.phase === "idle") return fail("AGENDA_NOT_STARTED");
  if (s.phase === "finished" || s.currentId !== input.stepId) return ok(s);
  const { now } = input;
  const idx = s.steps.findIndex((x) => x.id === s.currentId);
  const spent = now - (s.stepStartedAt ?? now);
  const nextIdx = s.steps.findIndex((x, i) => i > idx && !x.skipped);
  // 終えた区切り・通り過ぎた飛ばし済みの区切りの所要を確定する
  const settle = (limit: number): PlannedStep[] =>
    s.steps.map((x, i) => (i === idx ? { ...x, spentMs: spent } : i > idx && i < limit && x.skipped ? { ...x, spentMs: 0 } : x));
  if (nextIdx === -1) {
    return ok({
      ...s,
      phase: "finished",
      steps: settle(s.steps.length),
      currentId: null,
      stepStartedAt: null,
      runningSince: null,
      accumulatedMs: 0,
      finishedAtMs: now - (s.startedAt ?? now),
    });
  }
  return ok({
    ...s,
    phase: "running",
    steps: settle(nextIdx),
    currentId: s.steps[nextIdx]!.id,
    stepStartedAt: now,
    runningSince: now,
    accumulatedMs: 0,
  });
}

/** 一時停止。区切りの計時は止まり、実時間は進む。 */
export function pause(s: AgendaState, now: number): R<"AGENDA_NOT_STARTED"> {
  if (s.phase === "idle") return fail("AGENDA_NOT_STARTED");
  if (s.phase !== "running") return ok(s);
  return ok({ ...s, phase: "paused", accumulatedMs: s.accumulatedMs + (now - (s.runningSince ?? now)), runningSince: null });
}

/** 再開。 */
export function resume(s: AgendaState, now: number): R<"AGENDA_NOT_STARTED"> {
  if (s.phase === "idle") return fail("AGENDA_NOT_STARTED");
  if (s.phase !== "paused") return ok(s);
  return ok({ ...s, phase: "running", runningSince: now });
}

/** いまの区切りを延長する。区切り ID が違えば何もしない。持ち時間が上限を超えれば拒む。`now` は呼び出しの対称性のために受ける。 */
export function extend(
  s: AgendaState,
  input: { stepId: string; minutes: number; now: number },
): R<"AGENDA_NOT_STARTED" | "STEP_BUDGET_EXCEEDED"> {
  if (s.phase === "idle") return fail("AGENDA_NOT_STARTED");
  if (s.phase === "finished" || s.currentId !== input.stepId) return ok(s);
  const step = s.steps.find((x) => x.id === input.stepId);
  if (step === undefined) return ok(s);
  const extensionSec = step.extensionSec + input.minutes * 60;
  if (step.durationSec + extensionSec > MAX_STEP_BUDGET_SEC) return fail("STEP_BUDGET_EXCEEDED");
  return ok({ ...s, steps: s.steps.map((x) => (x.id === step.id ? { ...x, extensionSec } : x)) });
}

/** まだ始まっていない区切りを飛ばす／戻す。 */
export function setSkipped(
  s: AgendaState,
  input: { stepId: string; skipped: boolean },
): R<"AGENDA_NOT_STARTED" | "AGENDA_FINISHED" | "STEP_NOT_FOUND" | "STEP_NOT_SKIPPABLE"> {
  if (s.phase === "idle") return fail("AGENDA_NOT_STARTED");
  if (s.phase === "finished") return fail("AGENDA_FINISHED");
  const idx = s.steps.findIndex((x) => x.id === input.stepId);
  if (idx === -1) return fail("STEP_NOT_FOUND");
  const cur = s.steps.findIndex((x) => x.id === s.currentId);
  if (idx <= cur) return fail("STEP_NOT_SKIPPABLE");
  if (s.steps[idx]!.skipped === input.skipped) return ok(s);
  return ok({ ...s, steps: s.steps.map((x, i) => (i === idx ? { ...x, skipped: input.skipped } : x)) });
}

/** シナリオを残して idle に戻す。展開をやり直し、延長・飛ばし・所要を消す。 */
export function reset(s: AgendaState): R {
  if (s.phase === "idle") return ok(s);
  const steps = expand({ title: s.title, steps: s.steps });
  return ok({ ...INITIAL_AGENDA_STATE, title: s.title, steps });
}
