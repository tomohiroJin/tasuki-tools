/**
 * 変わった動きの角度の部品（#640）。React にも時計にも依存しない純粋関数。
 *
 * 動きは 2 つの場面に分かれる。**どちらも止まる角度（`finalAngle`）には触れない**ので、どの画面も同じ席・同じ位置で止まる
 * （合成は `wheel-motion.ts` の `angleAtPicks`）。
 *
 * - **動き出し**（回り出す前）: 開始角からの差（度）の区間の列。終わった角度から本体が始まる
 * - **途中で向きを変える**: 本体の途中（`TURNBACK_AT_MS`）に差し込む動き（式）。差し込みの終わりは差 0 で、始まりと終わりの速さを本体の速さにつなぐ
 *
 * 長さは core の表（`LAUNCH_MOTION_EXTRA_MS`・`SPIN_MOTION_EXTRA_MS`・上限で詰めた長さ `launchMotionMs`）と同じにする
 * （テストが見る。画面は長さの写しを持たない: 動き出しが詰められたときは区間の長さを比で縮める）。
 * 向きの切り返しは 1 秒に 3 回までにする（速い行き来が点滅に見えない・WCAG 2.3.1）。
 * 角度は回る向きが正（`stop-style-motion.ts` と同じ）。
 */
import { isLaunchMotion, isSpinMotion, type LaunchMotion, type SpinMotion } from '@tasuki/roulette-core';
import { easeInOutSine, easeOutCubic, linear, type Ease } from './easing';

/** 区間。`to` は動き出しの開始角（差し込みでは差し込みの始めの角度）からの差（度） */
interface Leg {
  to: number;
  ms: number;
  ease: Ease;
}

/** 動き出しごとの区間 */
const LAUNCH_LEGS: Readonly<Record<LaunchMotion, readonly Leg[]>> = {
  // 震える: その場で小さく左右に振れて（4°）、開始角へ戻ってから飛び出す
  shake: [
    { to: 4, ms: 300, ease: easeInOutSine },
    { to: -4, ms: 350, ease: easeInOutSine },
    { to: 0, ms: 250, ease: easeInOutSine },
  ],
  // 溜める: 逆へ少し引く。引いた位置から勢いよく回り出す
  windup: [{ to: -28, ms: 800, ease: easeInOutSine }],
  // つまずく: 少し回って止まりかけ、間を置いて、もう一度回り出す
  stumble: [
    { to: 50, ms: 600, ease: easeOutCubic },
    { to: 50, ms: 700, ease: linear },
  ],
};

/** 途中で向きを変えるを差し込む、本体の経過（ms）。勢いのついた序盤の後 */
export const TURNBACK_AT_MS = 1200;

/** 途中で向きを変えるの差し込みの長さ（ms）。core の表（`SPIN_MOTION_EXTRA_MS.turnback`）と同じであること（テストが見る） */
const TURNBACK_MS = 1000;
/** 差し込みの中の逆戻りの深さ（度に近い値）。大きいほど深く戻る */
const TURNBACK_DEPTH = 1600;

const sumMs = (legs: readonly Leg[]): number => legs.reduce((sum, leg) => sum + leg.ms, 0);

/** 動き出しの区間の長さの合計（ms・詰める前）。core の表と同じであること（テストが見る） */
export function launchLegsMs(motion: LaunchMotion): number {
  return sumMs(LAUNCH_LEGS[motion]);
}

/** 途中で向きを変えるの差し込みの長さ（ms）。core の表と同じであること（テストが見る） */
export function turnbackLegsMs(): number {
  return TURNBACK_MS;
}

/** 区間を `scale` 倍の長さで進め、経過 `elapsedMs` の差（度）を返す。終わったら最後の差 */
function offsetAt(legs: readonly Leg[], elapsedMs: number, scale: number): number {
  let from = 0;
  let t = Math.max(elapsedMs, 0);
  for (const leg of legs) {
    const ms = leg.ms * scale;
    if (t < ms) return from + (leg.to - from) * leg.ease(t / ms);
    t -= ms;
    from = leg.to;
  }
  return from;
}

/**
 * 動き出しの経過 `elapsedMs` の、開始角からの差（度）。`actualMs` は上限で詰めた実際の長さ（core の `launchMotionMs`）で、
 * 区間の長さを比で縮める。0 なら動き出しは無い（差 0）。
 */
export function launchOffset(motion: LaunchMotion, elapsedMs: number, actualMs: number): number {
  if (actualMs <= 0) return 0;
  return offsetAt(LAUNCH_LEGS[motion], elapsedMs, actualMs / launchLegsMs(motion));
}

/** 動き出しが終わったときの、開始角からの差（度）。本体はここから始まる */
export function launchEndOffset(motion: LaunchMotion): number {
  return offsetAt(LAUNCH_LEGS[motion], Number.POSITIVE_INFINITY, 1);
}

/**
 * 途中で向きを変える差し込みの経過 `elapsedMs` の、差し込み前の角度からの差（度）。`speed` は差し込み前の本体の速さ（度/ms）。
 * 差し込みの間、本体は止めてこの差だけを動かす。**始まりと終わりの速さを本体の速さ `speed` に合わせる**（跳ばない）:
 * o(x) = L·speed·x(1−x)(1−2x) − DEPTH·x²(1−x)²（x = 経過 / L）は、o(0) = o(1) = 0・o'(0) = o'(1) = speed。
 * 前半で少し進み、半ばで減速して逆向きに回り、後半でまた元の向きへ戻る（向きの切り返しは 2 回）。
 */
export function turnbackOffset(elapsedMs: number, speed: number): number {
  const x = Math.min(Math.max(elapsedMs / TURNBACK_MS, 0), 1);
  return TURNBACK_MS * speed * x * (1 - x) * (1 - 2 * x) - TURNBACK_DEPTH * x * x * (1 - x) * (1 - x);
}

/** wire の回転の動きの名前を読む。無い・知らない名前は null（いつもの動き） */
export function spinMotionOf(name: string | null | undefined): SpinMotion | null {
  return isSpinMotion(name) ? name : null;
}

/** wire の動き出しの名前を読む。無い・知らない名前は null（いつもの動き） */
export function launchMotionOf(name: string | null | undefined): LaunchMotion | null {
  return isLaunchMotion(name) ? name : null;
}
