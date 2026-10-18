/**
 * 変わった止まり方の角度（#420 spec S1・S2・S6）。React にも時計にも依存しない純粋関数。
 *
 * 止まり方は**区間の列**で書く。各区間は「止まる角度（`finalAngle`）からの差」へ、決めた長さと緩急で動く。
 * 最初の区間は開始角から動き始め、最後の区間は必ず止まる角度（差 0）で終わる。だから**どの画面も同じ席・同じ位置で止まり**、
 * 止まった後は普通の止まり方と同じ角度になる（止まった後の描き方・寄せ方を変えない）。
 *
 * 区間の長さの合計は core の表（`pickStopsMs(1, style)` の 1 件目）と同じにする（テストが見る）。
 * 向きの切り返しは 1 秒に 3 回までにする（速い行き来が点滅に見えない・WCAG 2.3.1）。
 */
import { isStopStyle, type StopStyle } from '@tasuki/roulette-core';
import { easeInOutCubic, easeInOutSine, easeOutCubic, easeOutSine, linear, type Ease } from './easing';

/** 3 次の減速だが、止まりきらずに少し速さを残す（ため: そのまま極端にゆっくり進む） */
const easeOutCubicCruise: Ease = (x) => 0.92 * easeOutCubic(x) + 0.08 * x;

/** 区間。`to` は止まる角度からの差（度）。`hold` は動かない区間 */
interface Leg {
  to: number;
  ms: number;
  ease: Ease;
}

/** 区間を組むための円盤の寸法。`seat` は 1 席の角度、`settle` は当たりの席の中の止まる位置 */
interface Geo {
  n: number;
  seat: number;
  settle: number;
}

const hold = (to: number, ms: number): Leg => ({ to, ms, ease: linear });

/**
 * 止まり方ごとの区間。角度は回る向きが正（指し針から見て、席の番号が小さくなる向き）。
 * 当たりの席に入る境目は、止まる位置から `(1 − settle)` 席ぶん手前にある。
 */
const LEGS: Readonly<Record<StopStyle, (g: Geo) => Leg[]>> = {
  // もう一押し: 当たりの 1 席手前でほぼ止まりかけ、再び 1 周ほど回って止まる
  nudge: ({ seat }) => [
    { to: -(360 + seat), ms: 3800, ease: easeOutCubic },
    { to: 0, ms: 2200, ease: easeInOutCubic },
  ],
  // 行き過ぎて戻る: 当たりを 1 席越えて止まり、逆に戻って当たりで止まる
  overshoot: ({ seat }) => [
    { to: seat, ms: 4000, ease: easeOutCubic },
    hold(seat, 300),
    { to: 0, ms: 900, ease: easeInOutCubic },
  ],
  // じりじり: 当たりの 1 席手前で止まったと見せて、間を置いて 1 席進む
  creep: ({ seat }) => [
    { to: -seat, ms: 4000, ease: easeOutCubic },
    hold(-seat, 900),
    { to: 0, ms: 600, ease: easeInOutCubic },
  ],
  // 境目でぐらつく: 当たりに入る境目をまたいで左右に揺れ、当たり側へ落ちる
  wobble: ({ seat, settle }) => {
    const edge = -(1 - settle) * seat;
    return [
      { to: edge - 0.35 * seat, ms: 3400, ease: easeOutCubic },
      { to: edge + 0.22 * seat, ms: 340, ease: easeInOutSine },
      { to: edge - 0.16 * seat, ms: 340, ease: easeInOutSine },
      { to: edge + 0.12 * seat, ms: 340, ease: easeInOutSine },
      { to: edge - 0.06 * seat, ms: 340, ease: easeInOutSine },
      { to: 0, ms: 1040, ease: easeInOutCubic },
    ];
  },
  // 一瞬の逆回り: 減速の途中で一瞬だけ逆に回り、また元の向きで止まる
  reverse: ({ seat }) => [
    { to: -540, ms: 2600, ease: easeOutCubic },
    { to: -540 - Math.min(0.8 * seat, 30), ms: 350, ease: easeInOutSine },
    { to: 0, ms: 2150, ease: easeInOutCubic },
  ],
  // ため: 当たりの手前で極端にゆっくりになり、なかなか止まらない
  linger: ({ seat }) => [
    { to: -0.8 * seat, ms: 3700, ease: easeOutCubicCruise },
    { to: 0, ms: 2800, ease: easeOutSine },
  ],
  // 二度止め: 半周ほど離れたほかの席で一度止まり、もう 1 周回って当たりで止まる
  double: ({ n, seat, settle }) => {
    const away = (1 - settle) * seat + (Math.floor((n - 1) / 2) + 0.5) * seat;
    return [
      { to: -(360 + away), ms: 3600, ease: easeOutCubic },
      hold(-(360 + away), 700),
      { to: 0, ms: 2200, ease: easeInOutCubic },
    ];
  },
  // 揺り戻し: 当たりを少し越えて止まり、振り子のように前後に揺れて落ち着く
  swing: ({ seat }) => {
    const a = 0.45 * seat;
    return [
      { to: a, ms: 4000, ease: easeOutCubic },
      { to: -0.55 * a, ms: 400, ease: easeInOutSine },
      { to: 0.3 * a, ms: 400, ease: easeInOutSine },
      { to: -0.12 * a, ms: 400, ease: easeInOutSine },
      { to: 0, ms: 400, ease: easeInOutSine },
    ];
  },
};

/** 止まり方の動きの長さ（ms）。core の表と同じであること（テストが見る） */
export function stopStyleLegsMs(style: StopStyle): number {
  return LEGS[style]({ n: 2, seat: 180, settle: 0.5 }).reduce((sum, leg) => sum + leg.ms, 0);
}

/**
 * 変わった止まり方で、経過 `elapsedMs` の回転子の角度（1 人目の回転）。開始角 `startDeg` から動き、
 * 止まる角度 `final`（`finalAngle`）で止まる。動きの長さを過ぎたら `final` そのもの。
 */
export function stopStyleAngle(style: StopStyle, elapsedMs: number, n: number, settle: number, startDeg: number, final: number): number {
  let from = startDeg;
  let t = Math.max(elapsedMs, 0);
  for (const leg of LEGS[style]({ n, seat: 360 / n, settle })) {
    const to = final + leg.to;
    if (t < leg.ms) return from + (to - from) * leg.ease(t / leg.ms);
    t -= leg.ms;
    from = to;
  }
  return final;
}

/** wire の止まり方の名前を読む。無い・知らない名前は null（普通に止まる） */
export function stopStyleOf(name: string | null | undefined): StopStyle | null {
  return isStopStyle(name) ? name : null;
}
