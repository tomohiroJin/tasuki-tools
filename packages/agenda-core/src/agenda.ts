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
import type { AgendaState, AgendaView, PlannedStep, ScenarioInput } from "./types.js";

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
  return ok(advanceStep(s, input.now));
}

/** いまの区切りを `at` で確定して次へ進める（running / paused の状態だけが渡る）。`next` と `advanceIfDue` が共有する。 */
function advanceStep(s: AgendaState, at: number): AgendaState {
  const idx = s.steps.findIndex((x) => x.id === s.currentId);
  const spent = at - (s.stepStartedAt ?? at);
  const nextIdx = s.steps.findIndex((x, i) => i > idx && !x.skipped);
  // 終えた区切り・通り過ぎた飛ばし済みの区切りの所要を確定する
  const settle = (limit: number): PlannedStep[] =>
    s.steps.map((x, i) => (i === idx ? { ...x, spentMs: spent } : i > idx && i < limit && x.skipped ? { ...x, spentMs: 0 } : x));
  if (nextIdx === -1) {
    return {
      ...s,
      phase: "finished",
      steps: settle(s.steps.length),
      currentId: null,
      stepStartedAt: null,
      runningSince: null,
      accumulatedMs: 0,
      finishedAtMs: at - (s.startedAt ?? at),
    };
  }
  return {
    ...s,
    phase: "running",
    steps: settle(nextIdx),
    currentId: s.steps[nextIdx]!.id,
    stepStartedAt: at,
    runningSince: at,
    accumulatedMs: 0,
  };
}

/** いまの区切りの持ち時間（ms） */
const budgetOf = (step: PlannedStep): number => (step.durationSec + step.extensionSec) * 1000;

/** 計時が持ち時間に達する単調時計の時刻。running のときだけ値を持つ（一時停止・開始前・終了は null）。 */
export function deadlineOf(s: AgendaState): number | null {
  if (s.phase !== "running" || s.runningSince === null) return null;
  const step = s.steps.find((x) => x.id === s.currentId);
  if (step === undefined) return null;
  return s.runningSince + budgetOf(step) - s.accumulatedMs;
}

/**
 * 期限を過ぎた「自動で次へ」の区切りを進める。前の確定も次の始まりも**期限ちょうど**で行う（発火の遅れを持ち込まない）。
 * 次も期限を過ぎていれば繰り返す。進める区切りがなければ同じ参照を返す。
 */
export function advanceIfDue(s: AgendaState, now: number): AgendaState {
  let cur = s;
  for (;;) {
    const deadline = deadlineOf(cur);
    const step = cur.steps.find((x) => x.id === cur.currentId);
    if (deadline === null || step === undefined || step.onTimeout !== "advance" || deadline > now) return cur;
    cur = advanceStep(cur, deadline);
  }
}

/** 画面へ送る写し。経過は `now` で計り、単調時計の値は載せない。 */
export function toView(s: AgendaState, now: number): AgendaView {
  const finished = s.phase === "finished";
  const runElapsedMs = finished ? (s.finishedAtMs ?? 0) : s.startedAt === null ? 0 : now - s.startedAt;
  const stepTimerMs = finished ? 0 : s.accumulatedMs + (s.runningSince === null ? 0 : now - s.runningSince);
  const stepSpentMs = finished || s.stepStartedAt === null ? 0 : now - s.stepStartedAt;
  return { phase: s.phase, title: s.title, steps: s.steps, currentId: s.currentId, runElapsedMs, stepTimerMs, stepSpentMs };
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

/** いまの区切りを延長する。区切り ID が違えば何もしない。持ち時間が上限を超えれば拒む。時刻は要らない（期限は `deadlineOf` が持ち時間から導く）。 */
export function extend(
  s: AgendaState,
  input: { stepId: string; minutes: number },
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
