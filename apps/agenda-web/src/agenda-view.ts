/**
 * 盤と進行表の文字（#429 spec §7.3・§7.6・§7.7）。`AgendaView` だけを読む純粋関数。
 * 文言は `copy.ts` から取る（書体の base 層の検査がそこを見る）。
 */
import { driftMs, plannedTotalMs, projectedEndMs, remainingMs, type AgendaView, type StepView } from '@tasuki/agenda-core';
import {
  FINISHED_LABEL,
  FOOTER_SEPARATOR,
  NOT_STARTED_LABEL,
  ON_PLAN_LABEL,
  OVERRUN_LABEL,
  PAUSED_LABEL,
  SUMMARY_SEPARATOR,
  driftText,
  nextStepText,
  overrunSummary,
  plannedSummary,
  projectedEndText,
  remainingSummary,
  stepCountText,
} from './copy';

const SEC = 1000;
const MIN = 60 * SEC;

export interface CenterLines {
  /** 最大の数字。残り（`m:ss`）・オーバー（`+m:ss`）・開始前は予定の合計・終了はかかった時間 */
  readonly primary: string;
  readonly isOverrun: boolean;
  /** いまのステップの名前（切り詰めない。2 行の切り詰めは CSS）。開始前はステップの数・終了は会の名前 */
  readonly name: string;
  /** 予定より ±n 分・予定どおり・開始前 */
  readonly drift: string;
}

export type DriftTone = 'late' | 'early' | 'even' | 'idle';

export type StepStatus = 'done' | 'now' | 'skipped' | 'todo';

export interface StepRow {
  readonly id: string;
  /** 1 から（盤の目盛りの番号と同じ） */
  readonly number: number;
  readonly name: string;
  readonly status: StepStatus;
  readonly plannedMin: number;
  readonly extensionMin: number;
}

const isActive = (v: AgendaView): boolean => v.phase === 'running' || v.phase === 'paused';

/** 秒を `m:ss` にする（分は 60 を超えても繰り上げない。盤の 1 周は最大 180 分） */
function clockOf(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(totalSec % 60).padStart(2, '0')}`;
}

/** 残りは秒を切り上げる（0:00 は残りが尽きた瞬間だけ）。オーバーは切り捨て */
const remainingClock = (ms: number): string => clockOf(Math.ceil(ms / SEC));
const elapsedClock = (ms: number): string => clockOf(Math.floor(ms / SEC));

/** オーバーか。**残りが 0 になった瞬間から**（時打ちの判定 `crossedZero` と同じ境目） */
export function isOverrun(v: AgendaView): boolean {
  return isActive(v) && remainingMs(v) <= 0;
}

/** 押し巻きを分へ丸めた値（絶対値で四捨五入し、符号を戻す。押しと巻きで境目を揃える: ±30 秒ちょうどは ±1 分） */
function driftMinutes(v: AgendaView): number {
  const d = driftMs(v);
  // `Math.round` は負の .5 を 0 の側へ丸める（−0.5 → −0）ので、絶対値で丸める
  return Math.sign(d) * Math.round(Math.abs(d) / MIN) || 0;
}

export function driftTone(v: AgendaView): DriftTone {
  if (v.phase === 'idle') return 'idle';
  const m = driftMinutes(v);
  return m > 0 ? 'late' : m < 0 ? 'early' : 'even';
}

function driftLine(v: AgendaView): string {
  if (v.phase === 'idle') return NOT_STARTED_LABEL;
  const m = driftMinutes(v);
  if (m === 0) return ON_PLAN_LABEL;
  // 負の印は U+2212（ハイフンでない）
  return m > 0 ? driftText('+', m) : driftText('−', -m);
}

const currentStep = (v: AgendaView): StepView | undefined => v.steps.find((x) => x.id === v.currentId);

export function centerLines(v: AgendaView): CenterLines {
  if (v.phase === 'idle') {
    return { primary: elapsedClock(plannedTotalMs(v)), isOverrun: false, name: stepCountText(v.steps.length), drift: driftLine(v) };
  }
  if (v.phase === 'finished') {
    return { primary: elapsedClock(v.runElapsedMs), isOverrun: false, name: v.title, drift: driftLine(v) };
  }
  const over = isOverrun(v);
  const rest = remainingMs(v);
  return {
    primary: over ? `+${elapsedClock(-rest)}` : remainingClock(rest),
    isOverrun: over,
    name: currentStep(v)?.name ?? '',
    drift: driftLine(v),
  };
}

/** 手元の時計の「時:分」（時は 0 詰めしない・分は 2 桁） */
function wallClock(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 次に始まるステップ（飛ばしたものを除く）。開始前は 1 つ目 */
function nextStep(v: AgendaView): StepView | undefined {
  if (v.phase === 'idle') return v.steps.find((x) => !x.skipped);
  const idx = v.steps.findIndex((x) => x.id === v.currentId);
  if (idx === -1) return undefined;
  return v.steps.find((x, i) => i > idx && !x.skipped);
}

/** 盤の下の一行: 「次は ◯◯ ・ 15:02 に終了見込み」。終了後は空 */
export function footerLine(v: AgendaView, wallNow: Date): string {
  if (v.phase === 'finished') return '';
  // 見込みは「開始した瞬間」からの相対。いまの手元の時刻へ、残りの見込みぶんを足す
  const restMs = projectedEndMs(v) - (v.phase === 'idle' ? 0 : v.runElapsedMs);
  const end = projectedEndText(wallClock(new Date(wallNow.getTime() + restMs)));
  const following = nextStep(v);
  return following === undefined ? end : `${nextStepText(following.name)}${FOOTER_SEPARATOR}${end}`;
}

function statusOf(v: AgendaView, x: StepView): StepStatus {
  if (x.skipped) return 'skipped';
  if (x.id === v.currentId) return 'now';
  return x.spentMs === null ? 'todo' : 'done';
}

/** 進行表の行 */
export function stepRows(v: AgendaView): StepRow[] {
  return v.steps.map((x, i) => ({
    id: x.id,
    number: i + 1,
    name: x.name,
    status: statusOf(v, x),
    plannedMin: x.durationSec / 60,
    extensionMin: x.extensionSec / 60,
  }));
}

/** オーバーの読み上げ。最初の 1 分は「オーバー 0 分」と言わず「オーバー」だけ */
const overrunPart = (overMs: number): string => {
  const minutes = Math.floor(overMs / MIN);
  return minutes === 0 ? OVERRUN_LABEL : overrunSummary(minutes);
};

/** 読み上げの要約（例「Try の議論、残り 12 分、予定より +3 分」）。分は残りなら切り上げ・オーバーは切り捨て */
export function summaryText(v: AgendaView): string {
  const parts: string[] = [];
  if (v.phase === 'idle') {
    parts.push(stepCountText(v.steps.length), plannedSummary(Math.round(plannedTotalMs(v) / MIN)), NOT_STARTED_LABEL);
  } else if (v.phase === 'finished') {
    parts.push(FINISHED_LABEL, driftLine(v));
  } else {
    const rest = remainingMs(v);
    parts.push(
      currentStep(v)?.name ?? '',
      isOverrun(v) ? overrunPart(-rest) : remainingSummary(Math.ceil(rest / MIN)),
      driftLine(v),
    );
    if (v.phase === 'paused') parts.push(PAUSED_LABEL);
  }
  return parts.join(SUMMARY_SEPARATOR);
}
