/**
 * 組む画面の下書き（#429 spec §4.2）。**下書きは画面の状態**で、「ルームに読み込む」を押したときだけ
 * ルームのシナリオを置き換える。ここは下書きの形・ルームとの比べ方・検証の理由を持つ純粋関数だけを置く。
 *
 * 画面の分は文字のまま持つ（打ちかけの「」や「1」を壊さない）。送るときに秒（×60）へ直す。
 */
import {
  MAX_ITEMS,
  MAX_SCENARIO_TITLE,
  MAX_STEP_NAME,
  MAX_PLANNED_STEPS,
  MAX_ROUNDS,
  MAX_TOTAL_SEC,
  MIN_ROUNDS,
  STEP_SEC_MAX,
  STEP_SEC_MIN,
  ScenarioInputSchema,
  definitionOf,
  expand,
  hasControlChars,
  type AgendaView,
  type ScenarioInput,
  type TimeoutBehavior,
  roundsOf,
} from '@tasuki/agenda-core';
import * as v from 'valibot';
import {
  NEED_STEP_TEXT,
  TITLE_CONTROL_TEXT,
  stepMinutesRangeText,
  stepNameBlankText,
  plannedStepsTooManyText,
  roundsRangeText,
  stepNameControlText,
  totalTooLongText,
} from './copy';

export interface DraftStep {
  /** React の key（並べ替えで行の入力が入れ替わらないように）。送らない */
  readonly key: number;
  readonly name: string;
  readonly minutes: string;
  readonly onTimeout: TimeoutBehavior;
}

export interface Draft {
  readonly title: string;
  readonly steps: readonly DraftStep[];
  /** くりかえしの回数。分の欄と同じく文字のまま持つ（新しい下書きは '1'） */
  readonly rounds: string;
}

export const MIN_MINUTES = STEP_SEC_MIN / 60;
export const MAX_MINUTES = STEP_SEC_MAX / 60;
/** 行を足したときの分 */
const NEW_STEP_MINUTES = 5;

let keySeq = 0;
const nextKey = (): number => ++keySeq;

/** 入力の上限で切る（`maxLength` は貼り付けや支援技術の入力を止めきらない） */
export const clipStepName = (s: string): string => s.slice(0, MAX_STEP_NAME);
export const clipTitle = (s: string): string => s.slice(0, MAX_SCENARIO_TITLE);

export const isEmptyDraft = (d: Draft): boolean => d.title === '' && d.steps.length === 0;

export function draftFromInput(input: ScenarioInput): Draft {
  return {
    title: input.title,
    steps: input.steps.map((s) => ({ key: nextKey(), name: s.name, minutes: String(s.durationSec / 60), onTimeout: s.onTimeout })),
    rounds: String(roundsOf(input)),
  };
}

/** ルームのシナリオ（開始前の写し）を入力の形へ戻す。展開済みの全部ではなく 1 回目と回数から組み直す */
export function inputFromView(view: AgendaView): ScenarioInput {
  return definitionOf(view);
}

/** 分の欄を整数として読む。数でなければ null（範囲は見ない） */
export function minutesOf(step: DraftStep): number | null {
  const t = step.minutes.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

/** 回数の欄を整数として読む。数でなければ null（範囲は見ない） */
export function roundsOfDraft(d: Draft): number | null {
  const t = d.rounds.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

const roundsInRange = (n: number | null): n is number => n !== null && n >= MIN_ROUNDS && n <= MAX_ROUNDS;

/** −／＋ で回数を 1 つ動かす。読めない欄は下限から数え直す */
export function bumpRounds(d: Draft, delta: -1 | 1): string {
  const cur = roundsOfDraft(d);
  const base = cur === null ? MIN_ROUNDS : cur + delta;
  return String(Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, base)));
}

const inRange = (m: number | null): m is number => m !== null && m >= MIN_MINUTES && m <= MAX_MINUTES;

/**
 * 下書きを送る形にする（検証はしない）。分が読めない行は 0 秒として残す（検証で落ちる）。
 * 回数が 1（または読めない）なら `rounds` キーを持たない。0・31 などは載せて、検証で落とす。
 */
export function inputFromDraft(d: Draft): ScenarioInput {
  const steps = d.steps.map((s) => ({ name: s.name, durationSec: (minutesOf(s) ?? 0) * 60, onTimeout: s.onTimeout }));
  const rounds = roundsOfDraft(d);
  return rounds === null || rounds === 1 ? { title: d.title, steps } : { title: d.title, steps, rounds };
}

/** 比べるための鍵（名前・秒・振る舞いの並びと会の名前と回数） */
export function scenarioKey(input: ScenarioInput): string {
  return JSON.stringify([input.title, roundsOf(input), input.steps.map((s) => [s.name, s.durationSec, s.onTimeout])]);
}

export type DraftCheck = { readonly ok: true; readonly input: ScenarioInput } | { readonly ok: false; readonly reason: string };

/** 最初に見つかった理由を 1 つ返す。理由の順は画面の上から（会の名前 → 行 → 回数 → 区切りの数 → 合計） */
function firstReason(d: Draft): string | null {
  if (d.steps.length === 0) return NEED_STEP_TEXT;
  if (hasControlChars(d.title)) return TITLE_CONTROL_TEXT;
  for (const [i, s] of d.steps.entries()) {
    if (s.name.trim() === '') return stepNameBlankText(i + 1);
    if (hasControlChars(s.name)) return stepNameControlText(i + 1);
    if (!inRange(minutesOf(s))) return stepMinutesRangeText(i + 1);
  }
  const rounds = roundsOfDraft(d);
  if (!roundsInRange(rounds)) return roundsRangeText();
  const planned = d.steps.length * rounds;
  if (planned > MAX_PLANNED_STEPS) return plannedStepsTooManyText(planned);
  const total = totalMinutes(d);
  if (total * 60 > MAX_TOTAL_SEC) return totalTooLongText(total);
  return null;
}

/**
 * 下書きを検証する。**合否は `ScenarioInputSchema` が決める**（サーバーと同じ境界）。理由の文はここで組む。
 * スキーマが落としたのに理由が見つからないときも、押させない（理由は汎用の一文）。
 */
export function checkDraft(d: Draft, fallbackReason: string): DraftCheck {
  const input = inputFromDraft(d);
  // 読めない回数は入力から落ちる（1 回扱い）ので、スキーマの前に止める
  if (roundsOfDraft(d) === null) return { ok: false, reason: roundsRangeText() };
  if (v.safeParse(ScenarioInputSchema, input).success) return { ok: true, input };
  return { ok: false, reason: firstReason(d) ?? fallbackReason };
}

/** 1 回あたりの分（読める行だけ） */
export function perRoundMinutes(d: Draft): number {
  return d.steps.reduce((sum, s) => sum + (minutesOf(s) ?? 0), 0);
}

/** 全部の分（1 回あたり × 回数。回数が読めなければ 1 回として数える） */
export function totalMinutes(d: Draft): number {
  return perRoundMinutes(d) * (roundsOfDraft(d) ?? 1);
}

/**
 * プレビューの盤に渡す開始前の写し。分が範囲内の行だけで組む（打ちかけの行で盤が崩れないように）。
 * 描ける行が無ければ null。
 */
export function previewView(d: Draft): AgendaView | null {
  const steps = d.steps
    .filter((s) => inRange(minutesOf(s)))
    .map((s) => ({ name: s.name, durationSec: (minutesOf(s) ?? 0) * 60, onTimeout: s.onTimeout }));
  if (steps.length === 0) return null;
  // 回数が読めない・範囲外のときは 1 回として展開する
  const parsed = roundsOfDraft(d);
  const rounds = roundsInRange(parsed) ? parsed : 1;
  return {
    phase: 'idle',
    title: d.title,
    rounds,
    steps: expand({ title: d.title, steps, ...(rounds === 1 ? {} : { rounds }) }),
    currentId: null,
    runElapsedMs: 0,
    stepTimerMs: 0,
    stepSpentMs: 0,
  };
}

// 行の編集（新しい下書きを返す）

export const canAddStep = (d: Draft): boolean => d.steps.length < MAX_ITEMS;

export function addStep(d: Draft): Draft {
  if (!canAddStep(d)) return d;
  return { ...d, steps: [...d.steps, { key: nextKey(), name: '', minutes: String(NEW_STEP_MINUTES), onTimeout: 'wait' }] };
}

export function updateStep(d: Draft, index: number, patch: Partial<Omit<DraftStep, 'key'>>): Draft {
  return { ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

export function removeStep(d: Draft, index: number): Draft {
  return { ...d, steps: d.steps.filter((_, i) => i !== index) };
}

/** 隣と入れ替える（delta は −1 か +1）。端を越えるなら変えない */
export function moveStep(d: Draft, index: number, delta: -1 | 1): Draft {
  const to = index + delta;
  if (to < 0 || to >= d.steps.length) return d;
  const steps = [...d.steps];
  const [moved] = steps.splice(index, 1);
  if (moved === undefined) return d;
  steps.splice(to, 0, moved);
  return { ...d, steps };
}

/** −／＋ で分を 1 つ動かす。読めない欄は下限から数え直す */
export function bumpMinutes(step: DraftStep, delta: -1 | 1): string {
  const cur = minutesOf(step);
  const base = cur === null ? MIN_MINUTES : cur + delta;
  return String(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, base)));
}
