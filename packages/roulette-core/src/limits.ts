/**
 * ルーレットの定数（#94）。
 */

/** 回転の長さ（ms）。全画面がこの長さで止まる（spec §6.4） */
export const SPIN_DURATION_MS = 4000;
/** 足した名前（ゲスト）の上限（1 ルーム） */
export const MAX_GUESTS = 12;
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

/** 変わった止まり方が出る割合の分母（#420 spec S3）。1 回ごとに一様に 1/20 */
export const STOP_STYLE_ODDS = 20;

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
 * i 人目が止まる時刻（回し始めからの ms）の表（#401 spec §6.2）。1 人目は #94 と同じ `SPIN_DURATION_MS`、
 * 2 人目からは止まって `STOP_HOLD_MS` 置き、`NEXT_MOVE_MS` で次の席へ送る。
 * 変わった止まり方（#420）は 1 人目を延ばし、2 人目からはその分だけ後ろへずれる。
 * **画面（いつ何人目まで決まったか・角度）とサーバー（回転の長さ）がこの表 1 つを読む。**
 */
export function pickStopsMs(pickCount: number, style?: string | null): number[] {
  const first = SPIN_DURATION_MS + stopStyleExtraMs(style);
  return Array.from({ length: pickCount }, (_, i) => first + i * (STOP_HOLD_MS + NEXT_MOVE_MS));
}

/**
 * k 人を選ぶ回転の全体の長さ（ms）= 最後の人が止まる時刻。**サーバーの回転中の判定と wire の `durationMs` の正本**
 * （#401 spec §5.1）。k = 1 では `SPIN_DURATION_MS` と同じ（#94 と同じ長さ）。変わった止まり方（#420）はその分だけ延びる。
 */
export function spinDurationMs(pickCount: number, style?: string | null): number {
  return pickStopsMs(pickCount, style).at(-1) ?? SPIN_DURATION_MS + stopStyleExtraMs(style);
}

/** 押して止めるときの回る速さ（1 秒に指し針を通る席の数・#401 押して止める P2）。利用者がモック 3 版で決めた */
export const PRESS_SEATS_PER_SEC = 20;
/** 押して止めるときに、誰も押さなければ止まる時刻（回し始めからの ms・P5） */
export const PRESS_AUTO_STOP_MS = 30_000;
