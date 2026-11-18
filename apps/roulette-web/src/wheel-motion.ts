/**
 * 円盤の動き（#94 PR 3・spec §6.4）。React にも時計にも依存しない純粋関数。
 *
 * 角度は「真上 0°・時計回り」。席 i は回転子の座標で `[i·s, (i+1)·s)`（`s = 360/n`）を占める。
 */
import {
  NEXT_MOVE_MS,
  SPIN_MOTION_EXTRA_MS,
  STOP_HOLD_MS,
  isSpinMotion,
  launchMotionMs,
  pickStopsMs,
  type SpinMotion,
  type StopStyle,
} from '@tasuki/roulette-core';
import { easeOutCubic } from './easing';
import { TURNBACK_AT_MS, launchEndOffset, launchMotionOf, launchOffset, turnbackOffset } from './spin-motion';
import { stopStyleAngle, stopStyleOf } from './stop-style-motion';

export { easeOutCubic };

/** 速い回転（#640）で、縮める前の序盤の長さ（本体の ms）。止まり方の最初の区間（最短 2600ms）より短い */
const FAST_SPAN_MS = 3000;

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

/** wire の変わった動き（#640）。動き出し・回転の名前（文字列のまま）。無い・知らない名前はいつもの動き */
export interface WireMotions {
  launchMotion?: string | null | undefined;
  spinMotion?: string | null | undefined;
}

/**
 * 変わった動き（#640）を掛けた 1 人目の大きな回転の、経過 `elapsedMs` の回転子の角度。
 * 動き出し → 本体（普通の止まり方か、変わった止まり方 `style`）の順。**止まる角度の 360° の剰余は動きに依らない**
 * ので、どの画面も同じ席・同じ位置で止まる（止まった後の角度は {@link finalAngle} と 360° の巡りを除いて同じ）。
 *
 * - 動き出し: 開始角からの差で動く。終わった角度から本体が始まる（詰めた長さは core の `launchMotionMs`）
 * - 速い: 本体の時間を縮める（止まり方の動きも同じ比で速くなる）
 * - 途中で向きを変える: 本体の `TURNBACK_AT_MS` に差し込みを足し、終わったら続きから
 * - 逆回転: 本体の進み具合を、開始角から逆向きの同じ大きさの回転へ写す（止まり方の動きも逆向きになる）
 */
function firstPickAngle(
  elapsedMs: number,
  spot: PickSpot,
  n: number,
  pointerDeg: number,
  startDeg: number,
  style: StopStyle | null,
  names: WireMotions,
): number {
  const launch = launchMotionOf(names.launchMotion);
  const spinMotion: SpinMotion | null = isSpinMotion(names.spinMotion) ? names.spinMotion : null;
  const launchMs = launch === null ? 0 : launchMotionMs(launch, style, spinMotion);
  if (launch !== null && elapsedMs < launchMs) return startDeg + launchOffset(launch, elapsedMs, launchMs);
  const start = launch !== null && launchMs > 0 ? startDeg + launchEndOffset(launch) : startDeg;
  const u = Math.max(elapsedMs, 0) - launchMs;
  // 動きの無い本体の長さ（止まり方の表。core の `pickStopsMs` と同じ表を読む）
  const normalMs = pickStopsMs(1, style)[0] ?? 0;
  const final = finalAngle(n, spot.index, spot.settle, pointerDeg, start);
  const base = (v: number): number =>
    style === null ? angleAt(v, normalMs, n, spot.index, spot.settle, pointerDeg, start) : styledAngleAt(style, v, n, spot.index, spot.settle, pointerDeg, start);
  // 逆回転は、本体の進み具合（0〜1）を逆向きの回転へ写す。逆向きの止まる角度は、正の向きの止まる角度から巡りの整数倍離れる（同じ席）
  const finalBackward = final - 360 * (2 * TURNS + 1);
  const shape = (a: number): number => (spinMotion === 'backward' ? start + ((finalBackward - start) * (a - start)) / (final - start) : a);

  if (spinMotion === 'fast') {
    // 序盤の FAST_SPAN_MS（本体の時間）を、縮める長さだけ短い時間で進める（速くなる）。後ろは普通の速さ。
    // 止まり方の細かい動き（終盤の区間）は縮めない（向きの切り返しが詰まって点滅に見えない）
    const real = FAST_SPAN_MS + SPIN_MOTION_EXTRA_MS.fast;
    return shape(base(u < real ? (u * FAST_SPAN_MS) / real : u - real + FAST_SPAN_MS));
  }
  if (spinMotion === 'turnback') {
    const inserted = SPIN_MOTION_EXTRA_MS.turnback;
    if (u < TURNBACK_AT_MS) return base(u);
    if (u < TURNBACK_AT_MS + inserted) return base(TURNBACK_AT_MS) + turnbackOffset(u - TURNBACK_AT_MS);
    return base(u - inserted);
  }
  return shape(base(u));
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
 * - 変わった動き（#640・`motions`）も 1 人目の大きな回転だけに掛け、止まる時刻は止まり方と合わせて core の表から取る。
 *   知らない名前・無いときはいつもの動き
 */
export function angleAtPicks(
  elapsedMs: number,
  picks: readonly PickSpot[],
  n: number,
  pointerDeg: number,
  startDeg: number,
  stopStyle?: string | null,
  motions?: WireMotions,
): number {
  const style = stopStyleOf(stopStyle);
  const names: WireMotions = motions ?? {};
  const stops = pickStopsMs(picks.length, style, { launch: names.launchMotion, spin: names.spinMotion });
  const first = picks[0];
  const firstStop = stops[0];
  if (first === undefined || firstStop === undefined) return startDeg;
  if (elapsedMs < firstStop) {
    // 変わった動き（#640）が無ければ、これまでと同じ式（#94・#420）
    return style === null && launchMotionOf(names.launchMotion) === null && !isSpinMotion(names.spinMotion)
      ? angleAt(elapsedMs, firstStop, n, first.index, first.settle, pointerDeg, startDeg)
      : firstPickAngle(elapsedMs, first, n, pointerDeg, startDeg, style, names);
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
