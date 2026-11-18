/**
 * ルーレットの定数（#94）。
 */

/** 回転の長さ（ms）。全画面がこの長さで止まる（spec §6.4） */
export const SPIN_DURATION_MS = 4000;
/** 足した名前（ゲスト）の上限（1 ルーム）。#458 で 12 → 24。1 人で回す使い方では全員がゲストになる */
export const MAX_GUESTS = 24;
/** 円盤の席数の上限。入る人がこれを超えたら回せない */
export const MAX_WHEEL = 24;
/** 当たりの席の中で止まる位置の揺らぎの下限（席の境目から離す） */
export const SETTLE_MIN = 0.2;
/** 当たりの席の中で止まる位置の揺らぎの上限 */
export const SETTLE_MAX = 0.8;

/** 1 回の回転で選ぶ人数の上限（#401 spec M5）。札に 4 行が収まる大きさ */
export const MAX_PICK = 4;
/** 2 人目からの、止まってから次の人へ送り始めるまでの間（ms・#401 spec M6。モックで詰める見込みの値） */
export const STOP_HOLD_MS = 500;
/** 2 人目からの、次の人の席まで送る時間（ms・#401 spec M6。モックで詰める見込みの値） */
export const NEXT_MOVE_MS = 1100;

/**
 * 変わった止まり方（#420 spec S1）。ごくまれに、1 人目の大きな回転の止まり方だけを変える（当たりは変えない）。
 * 動きそのもの（角度）は画面が描く（`apps/roulette-web/src/stop-style-motion.ts`）。ここは名前と長さだけを持つ。
 */
export const STOP_STYLES = ["nudge", "overshoot", "creep", "wobble", "reverse", "linger", "double", "swing"] as const;
export type StopStyle = (typeof STOP_STYLES)[number];

/**
 * 変わった止まり方が出る割合の分母（#420 spec S3）。1 回ごとに一様に 1/24。
 * 24 は 1 日の時間の数: 1 時間に 1 回回すと、1 日に 1 回ほど見られる
 */
export const STOP_STYLE_ODDS = 24;

/**
 * 止まり方ごとに、1 人目が止まる時刻を延ばす長さ（ms・#420 spec S2）。長くても +3 秒。
 * 画面の動きの長さはこの表に合わせる（写しを持たない）。
 */
export const STOP_STYLE_EXTRA_MS: Readonly<Record<StopStyle, number>> = Object.freeze({
  nudge: 2000,
  overshoot: 1200,
  creep: 1500,
  wobble: 1800,
  reverse: 1100,
  linger: 2500,
  double: 2500,
  swing: 1600,
});

/** 止まり方の名前か（wire は文字列で届く。新しいサーバーの知らない名前は止まり方が無いものとして読む） */
export function isStopStyle(value: unknown): value is StopStyle {
  return typeof value === "string" && (STOP_STYLES as readonly string[]).includes(value);
}

/** 止まり方で延びる長さ（ms）。無い・知らない名前なら 0 */
export function stopStyleExtraMs(style: string | null | undefined): number {
  return isStopStyle(style) ? STOP_STYLE_EXTRA_MS[style] : 0;
}

/**
 * 変わった動き（#640）。止まり方（#420）とは別の確率で、回転の別の場面を変える。見せ方だけで、当たりは変えない。
 * 動き出し（回り出す前）と回転（回っている最中）を**別々に・独立に**引く（止まり方とも重なってよい）。
 * 動きそのもの（角度）は画面が描く（`apps/roulette-web/src/spin-motion.ts`）。ここは名前と長さだけを持つ。
 *
 * 動き出し: shake（震える）・windup（溜める）・stumble（つまずく）。
 * 回転: backward（逆回転）・turnback（途中で向きを変える）・fast（速い）。
 */
export const LAUNCH_MOTIONS = ["shake", "windup", "stumble"] as const;
export type LaunchMotion = (typeof LAUNCH_MOTIONS)[number];
export const SPIN_MOTIONS = ["backward", "turnback", "fast"] as const;
export type SpinMotion = (typeof SPIN_MOTIONS)[number];

/** 動き出しが出る割合の分母（#640 決めること 1）。1/12。実際に回して調整する */
export const LAUNCH_MOTION_ODDS = 12;
/** 回転の動きが出る割合の分母（#640 決めること 1）。1/16。実際に回して調整する */
export const SPIN_MOTION_ODDS = 16;

/**
 * 動き出しごとに、1 人目が止まる時刻を延ばす長さ（ms）。ほかの動きと重なって上限（{@link MOTION_EXTRA_CAP_MS}）を越えるときは
 * {@link launchMotionMs} が詰める。画面の動きの長さはこの表（と詰めた長さ）に合わせる（写しを持たない）。
 */
export const LAUNCH_MOTION_EXTRA_MS: Readonly<Record<LaunchMotion, number>> = Object.freeze({
  shake: 900,
  windup: 800,
  stumble: 1300,
});

/**
 * 回転の動きごとに、1 人目が止まる時刻を延ばす長さ（ms）。逆回転は同じ長さ・途中で向きを変えるは延び・速いは縮む（負の値）。
 * 画面は途中で向きを変えるのとき、この長さぶんを回転の途中に差し込み、速いのとき残りの動きをこの比で詰める。
 */
export const SPIN_MOTION_EXTRA_MS: Readonly<Record<SpinMotion, number>> = Object.freeze({
  backward: 0,
  turnback: 1000,
  fast: -1000,
});

/** 止まり方・動き出し・回転の延びる長さの合計の上限（ms・#640 決めること 3）。越えるときは動き出しを詰める */
export const MOTION_EXTRA_CAP_MS = 4000;

/** 動き出しの名前か（wire は文字列で届く。知らない名前は動きが無いものとして読む） */
export function isLaunchMotion(value: unknown): value is LaunchMotion {
  return typeof value === "string" && (LAUNCH_MOTIONS as readonly string[]).includes(value);
}

/** 回転の動きの名前か（知らない名前は動きが無いものとして読む） */
export function isSpinMotion(value: unknown): value is SpinMotion {
  return typeof value === "string" && (SPIN_MOTIONS as readonly string[]).includes(value);
}

/** 回転の動きで延びる長さ（ms）。無い・知らない名前なら 0。負なら短くなる */
export function spinMotionExtraMs(spin: string | null | undefined): number {
  return isSpinMotion(spin) ? SPIN_MOTION_EXTRA_MS[spin] : 0;
}

/** wire で届く動きの名前（止まり方は別の引数）。無い・知らない名前は動きが無いものとして読む */
export interface MotionNames {
  launch?: string | null | undefined;
  spin?: string | null | undefined;
}

/**
 * 動き出しの実際の長さ（ms）。無い・知らない名前なら 0。表の長さを、止まり方と回転の動きで延びた長さを引いた上限の残りに詰める
 * （残りは 0 まで。**詰めるのは動き出しだけ**）。サーバーの回転の長さと画面の動き出しの長さがこの 1 つを読む。
 */
export function launchMotionMs(launch: string | null | undefined, style: string | null | undefined, spin: string | null | undefined): number {
  if (!isLaunchMotion(launch)) return 0;
  const room = MOTION_EXTRA_CAP_MS - stopStyleExtraMs(style) - spinMotionExtraMs(spin);
  return Math.max(0, Math.min(LAUNCH_MOTION_EXTRA_MS[launch], room));
}

/** 1 人目が止まる時刻の延び（ms）。止まり方・動き出し（詰めた長さ）・回転の動きの合計 */
function firstExtraMs(style: string | null | undefined, motions: MotionNames | undefined): number {
  return stopStyleExtraMs(style) + launchMotionMs(motions?.launch, style, motions?.spin) + spinMotionExtraMs(motions?.spin);
}

/**
 * i 人目が止まる時刻（回し始めからの ms）の表（#401 spec §6.2）。1 人目は #94 と同じ `SPIN_DURATION_MS`、
 * 2 人目からは止まって `STOP_HOLD_MS` 置き、`NEXT_MOVE_MS` で次の席へ送る。
 * 変わった止まり方（#420）は 1 人目を延ばし、2 人目からはその分だけ後ろへずれる。
 * **画面（いつ何人目まで決まったか・角度）とサーバー（回転の長さ）がこの表 1 つを読む。**
 */
export function pickStopsMs(pickCount: number, style?: string | null, motions?: MotionNames): number[] {
  const first = SPIN_DURATION_MS + firstExtraMs(style, motions);
  return Array.from({ length: pickCount }, (_, i) => first + i * (STOP_HOLD_MS + NEXT_MOVE_MS));
}

/**
 * k 人を選ぶ回転の全体の長さ（ms）= 最後の人が止まる時刻。**サーバーの回転中の判定と wire の `durationMs` の正本**
 * （#401 spec §5.1）。k = 1 では `SPIN_DURATION_MS` と同じ（#94 と同じ長さ）。変わった止まり方（#420）はその分だけ延びる。
 */
export function spinDurationMs(pickCount: number, style?: string | null, motions?: MotionNames): number {
  return pickStopsMs(pickCount, style, motions).at(-1) ?? SPIN_DURATION_MS + firstExtraMs(style, motions);
}

/** 押して止めるときの回る速さ（1 秒に指し針を通る席の数・#401 押して止める P2）。利用者がモック 3 版で決めた */
export const PRESS_SEATS_PER_SEC = 20;
/** 押して止めるときに、誰も押さなければ止まる時刻（回し始めからの ms・P5） */
export const PRESS_AUTO_STOP_MS = 30_000;
