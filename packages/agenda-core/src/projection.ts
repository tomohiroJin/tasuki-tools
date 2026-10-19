/**
 * 画面とテストが使う純粋関数（#429 spec §4.1）。`AgendaView` だけを読み、状態・時計には触れない。
 * 単位はすべて ms。見込み・押し巻きは「開始した瞬間」からの相対値。
 */
import type { AgendaView, StepView } from "./types.js";

export interface SummaryRow {
  readonly id: string;
  readonly name: string;
  readonly plannedMs: number;
  readonly extensionMs: number;
  readonly spentMs: number;
  /** 所要 − 予定の長さ（飛ばした行は −予定） */
  readonly diffMs: number;
  readonly skipped: boolean;
}

export interface Summary {
  readonly rows: readonly SummaryRow[];
  readonly driftMs: number;
}

const isActive = (v: AgendaView): boolean => v.phase === "running" || v.phase === "paused";

/** 経過を `deltaMs` 進める。running は 3 つすべて・paused は区切りの計時を除く・idle と終了は同じ値。 */
export function advanceView(v: AgendaView, deltaMs: number): AgendaView {
  if (v.phase === "running") {
    return { ...v, runElapsedMs: v.runElapsedMs + deltaMs, stepTimerMs: v.stepTimerMs + deltaMs, stepSpentMs: v.stepSpentMs + deltaMs };
  }
  if (v.phase === "paused") {
    return { ...v, runElapsedMs: v.runElapsedMs + deltaMs, stepSpentMs: v.stepSpentMs + deltaMs };
  }
  return v;
}

/** 区切りの持ち時間（長さ＋延長） */
export function budgetMs(step: StepView): number {
  return (step.durationSec + step.extensionSec) * 1000;
}

/** 予定の合計。飛ばした区切りも含み、開始後は動かない。 */
export function plannedTotalMs(v: AgendaView): number {
  return v.steps.reduce((sum, x) => sum + x.durationSec * 1000, 0);
}

/** いまの区切りの残り。負ならオーバー。進行中・一時停止中以外は 0。 */
export function remainingMs(v: AgendaView): number {
  if (!isActive(v)) return 0;
  const cur = v.steps.find((x) => x.id === v.currentId);
  return cur === undefined ? 0 : budgetMs(cur) - v.stepTimerMs;
}

/** オーバーした分（0 以上） */
export function overrunMs(v: AgendaView): number {
  return Math.max(-remainingMs(v), 0);
}

/** 終わる見込み。実時間の経過 ＋ max(残り, 0) ＋ まだ始まっていない区切り（飛ばしたものを除く）の持ち時間。 */
export function projectedEndMs(v: AgendaView): number {
  if (v.phase === "idle") return plannedTotalMs(v);
  if (v.phase === "finished") return v.runElapsedMs;
  const idx = v.steps.findIndex((x) => x.id === v.currentId);
  const rest = v.steps.reduce((sum, x, i) => (i > idx && !x.skipped ? sum + budgetMs(x) : sum), 0);
  return v.runElapsedMs + Math.max(remainingMs(v), 0) + rest;
}

/** 押し巻き。正なら押し・負なら巻き。 */
export function driftMs(v: AgendaView): number {
  return projectedEndMs(v) - plannedTotalMs(v);
}

/** 終了の一覧。行の差の合計は押し巻きと等しい（飛ばした区切りは所要 0・差 −予定）。 */
export function summaryOf(v: AgendaView): Summary {
  const rows = v.steps.map((x): SummaryRow => {
    const plannedMs = x.durationSec * 1000;
    const spentMs = x.skipped ? 0 : (x.spentMs ?? 0);
    return { id: x.id, name: x.name, plannedMs, extensionMs: x.extensionSec * 1000, spentMs, diffMs: spentMs - plannedMs, skipped: x.skipped };
  });
  return { rows, driftMs: driftMs(v) };
}
