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
  driftShortText,
  driftText,
  extensionNote,
  nextStepText,
  overrunSummary,
  plannedSummary,
  projectedEndText,
  roundBadgeText,
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
  /** 何回目か（回数 1 は常に 1。進行表の回の見出しの区切りに使う） */
  readonly round: number;
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

/** 盤の中央の回の札「2 / 6 回」。進行中・一時停止中で回数 2 以上のときだけ（それ以外は空） */
export function roundBadge(v: AgendaView): string {
  if (!isActive(v) || v.rounds < 2) return '';
  const cur = currentStep(v);
  return cur === undefined ? '' : roundBadgeText(cur.round, v.rounds);
}

/**
 * 進行表の枠（`overflow-y: auto`）の中で、行が見えるようにする `scrollTop`。
 * 収まっていればいまのまま・上にはみ出せば行の上端・下にはみ出せば行の下端を枠の下端へ。
 * （`scrollIntoView` は祖先のページまで動かすので使わない）
 */
export function scrollTopToReveal(
  box: { scrollTop: number; clientHeight: number },
  row: { offsetTop: number; offsetHeight: number },
): number {
  if (row.offsetTop < box.scrollTop) return row.offsetTop;
  const rowBottom = row.offsetTop + row.offsetHeight;
  if (rowBottom > box.scrollTop + box.clientHeight) return rowBottom - box.clientHeight;
  return box.scrollTop;
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

/** 次に始まるステップの名前（無ければ空。映す表示の右の列） */
export function nextStepName(v: AgendaView): string {
  return v.phase === 'finished' ? '' : (nextStep(v)?.name ?? '');
}

/** 終わる見込みの手元の時刻「15:02」。見込みは「開始した瞬間」からの相対なので、いまの時刻へ残りの見込みぶんを足す */
export function projectedEndClock(v: AgendaView, wallNow: Date): string {
  const restMs = projectedEndMs(v) - (v.phase === 'idle' ? 0 : v.runElapsedMs);
  return wallClock(new Date(wallNow.getTime() + restMs));
}

/** 盤の下の一行: 「次は ◯◯ ・ 15:02 に終了見込み」。終了後は空 */
export function footerLine(v: AgendaView, wallNow: Date): string {
  if (v.phase === 'finished') return '';
  const end = projectedEndText(projectedEndClock(v, wallNow));
  const following = nextStep(v);
  return following === undefined ? end : `${nextStepText(following.name)}${FOOTER_SEPARATOR}${end}`;
}

/** いまのステップを延長しているときの添え書き「予定 7 分 + 3 分」（spec §7.2）。延長が無ければ空 */
export function extensionLine(v: AgendaView): string {
  if (!isActive(v)) return '';
  const cur = currentStep(v);
  if (cur === undefined || cur.extensionSec === 0) return '';
  return extensionNote(cur.durationSec / 60, cur.extensionSec / 60);
}

/** 映す表示の大きな押し巻き（「+3 分」「−2 分」「予定どおり」）。開始前は空 */
export function driftShort(v: AgendaView): string {
  if (v.phase === 'idle') return '';
  const m = driftMinutes(v);
  if (m === 0) return ON_PLAN_LABEL;
  return m > 0 ? driftShortText('+', m) : driftShortText('−', -m);
}

/** 終了の一覧の長さ「m:ss」（秒は切り捨て。盤のかかった時間と同じ） */
export const durationClock = (ms: number): string => elapsedClock(Math.max(ms, 0));

/**
 * 終了の一覧の差「+0:30」「−1:50」（負の印は U+2212）。秒は絶対値で四捨五入し、0 は印を付けない。
 * 合計の行と各行の差は同じ規則で書く（合計の押し巻きは `summaryOf(v).driftMs`）。
 */
export function signedDuration(ms: number): string {
  const sec = Math.round(Math.abs(ms) / SEC);
  if (sec === 0) return clockOf(0);
  return `${ms > 0 ? '+' : '−'}${clockOf(sec)}`;
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
    round: x.round,
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
    const round = roundBadge(v);
    parts.push(
      currentStep(v)?.name ?? '',
      ...(round === '' ? [] : [round]),
      isOverrun(v) ? overrunPart(-rest) : remainingSummary(Math.ceil(rest / MIN)),
      driftLine(v),
    );
    if (v.phase === 'paused') parts.push(PAUSED_LABEL);
  }
  return parts.join(SUMMARY_SEPARATOR);
}
