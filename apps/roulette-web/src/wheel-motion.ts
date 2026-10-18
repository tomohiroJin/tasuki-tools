/**
 * 円盤の動き（#94 PR 3・spec §6.4）。React にも時計にも依存しない純粋関数。
 *
 * 角度は「真上 0°・時計回り」。席 i は回転子の座標で `[i·s, (i+1)·s)`（`s = 360/n`）を占める。
 */
import { NEXT_MOVE_MS, STOP_HOLD_MS, pickStopsMs, type StopStyle } from '@tasuki/roulette-core';
import { easeOutCubic } from './easing';
import { stopStyleAngle, stopStyleOf } from './stop-style-motion';

export { easeOutCubic };

/** 余分に回る周回（2 版で 5 → 4）。 */
export const TURNS = 4;

/** 舞台の幅がこれより狭ければ縦積み（指し針は下）。 */
const STACK_MAX_PX = 720;

export type StageLayout = 'stack' | 'row';

/** 舞台の幅で決める並び。**画面の幅ではない**（脇の有無で舞台の幅が変わる）。 */
export function stageLayoutFor(widthPx: number): StageLayout {
  return widthPx >= STACK_MAX_PX ? 'row' : 'stack';
}

/** 指し針の位置（円盤の外）。縦積みは真下（180°）・横並びは右（90°）。 */
export function pointerDegFor(layout: StageLayout): number {
  return layout === 'row' ? 90 : 180;
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

/**
 * 指し針の下に、当たりの席の `settle`（0〜1）の位置が来る回転子の角度。
 *
 * **360° の剰余は `startDeg` に依らない**ので、どの画面も同じ席で止まる。`startDeg` は回し始めに
 * その画面が見せている角度で、0° へ戻さない（戻すと前の止まった位置から跳ぶ）。
 */
export function finalAngle(n: number, winnerIndex: number, settle: number, pointerDeg: number, startDeg: number): number {
  return startDeg + 360 * TURNS + mod(pointerDeg - (winnerIndex + settle) * (360 / n) - startDeg, 360);
}

/** 経過 `elapsedMs` の回転子の角度。 */
export function angleAt(
  elapsedMs: number,
  durationMs: number,
  n: number,
  winnerIndex: number,
  settle: number,
  pointerDeg: number,
  startDeg: number,
): number {
  const t = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return startDeg + (finalAngle(n, winnerIndex, settle, pointerDeg, startDeg) - startDeg) * easeOutCubic(t);
}

/**
 * 変わった止まり方（#420）で、経過 `elapsedMs` の回転子の角度。引数は {@link angleAt} と同じ（長さは止まり方が持つ）。
 * 止まる角度は {@link finalAngle} と同じなので、どの画面も同じ席・同じ位置で止まる。
 */
export function styledAngleAt(
  style: StopStyle,
  elapsedMs: number,
  n: number,
  winnerIndex: number,
  settle: number,
  pointerDeg: number,
  startDeg: number,
): number {
  return stopStyleAngle(style, elapsedMs, n, settle, startDeg, finalAngle(n, winnerIndex, settle, pointerDeg, startDeg));
}

/** 回転子が `angle` のとき、指し針の下にある席の番号（指し針の弾みに使う）。 */
export function segmentBoundaryIndex(angle: number, n: number, pointerDeg: number): number {
  return Math.floor(mod(pointerDeg - angle, 360) / (360 / n));
}

/** 止まる順の当たりの 1 人（wire の `picks` の要素） */
export interface PickSpot {
  index: number;
  settle: number;
}

/**
 * k 人を続けて止める回転の、経過 `elapsedMs` の回転子の角度（#401 spec §6.2）。
 *
 * - 1 人目へは #94 の {@link angleAt} そのもの（`pickStopsMs` の 1 件目の長さ・`TURNS` 周・3 次の減速）。
 *   止まった後は {@link finalAngle} の値をそのまま使う（**k = 1 の角度の列は #94 と同じ**）
 * - 2 人目からは、止まって `STOP_HOLD_MS` 置き、直前の止まった角度から 1 周足して次の席の `settle` の位置まで
 *   `NEXT_MOVE_MS` で送る（3 次の減速）。各区間の止まる角度の 360° の剰余は開始角に依らないので、
 *   どの画面も同じ席・同じ順で止まる
 * - 止まる時刻は core の `pickStopsMs`（サーバーの回転の長さと同じ表）から取る
 * - 変わった止まり方（#420・`stopStyle`）は 1 人目の回転だけを {@link styledAngleAt} で描く。2 人目からはその分だけ後ろへずれる。
 *   知らない名前・無いときは普通の止まり方
 */
export function angleAtPicks(
  elapsedMs: number,
  picks: readonly PickSpot[],
  n: number,
  pointerDeg: number,
  startDeg: number,
  stopStyle?: string | null,
): number {
  const style = stopStyleOf(stopStyle);
  const stops = pickStopsMs(picks.length, style);
  const first = picks[0];
  const firstStop = stops[0];
  if (first === undefined || firstStop === undefined) return startDeg;
  if (elapsedMs < firstStop) {
    return style === null
      ? angleAt(elapsedMs, firstStop, n, first.index, first.settle, pointerDeg, startDeg)
      : styledAngleAt(style, elapsedMs, n, first.index, first.settle, pointerDeg, startDeg);
  }
  let angle = finalAngle(n, first.index, first.settle, pointerDeg, startDeg);
  for (let i = 1; i < picks.length; i++) {
    const p = picks[i]!;
    const begin = stops[i - 1]! + STOP_HOLD_MS;
    if (elapsedMs <= begin) return angle;
    const to = angle + 360 + mod(pointerDeg - (p.index + p.settle) * (360 / n) - angle, 360);
    if (elapsedMs < begin + NEXT_MOVE_MS) return angle + (to - angle) * easeOutCubic((elapsedMs - begin) / NEXT_MOVE_MS);
    angle = to;
  }
  return angle;
}

/** k 人の回転が終わった後の角度（最後の人の席の `settle` の位置）。止まり方に依らない */
export function finalAngleOfPicks(picks: readonly PickSpot[], n: number, pointerDeg: number, startDeg: number): number {
  return angleAtPicks(Number.POSITIVE_INFINITY, picks, n, pointerDeg, startDeg);
}
