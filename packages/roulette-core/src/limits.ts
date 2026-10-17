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
 * i 人目が止まる時刻（回し始めからの ms）の表（#401 spec §6.2）。1 人目は #94 と同じ `SPIN_DURATION_MS`、
 * 2 人目からは止まって `STOP_HOLD_MS` 置き、`NEXT_MOVE_MS` で次の席へ送る。
 * **画面（いつ何人目まで決まったか・角度）とサーバー（回転の長さ）がこの表 1 つを読む。**
 */
export function pickStopsMs(pickCount: number): number[] {
  return Array.from({ length: pickCount }, (_, i) => SPIN_DURATION_MS + i * (STOP_HOLD_MS + NEXT_MOVE_MS));
}

/**
 * k 人を選ぶ回転の全体の長さ（ms）= 最後の人が止まる時刻。**サーバーの回転中の判定と wire の `durationMs` の正本**
 * （#401 spec §5.1）。k = 1 では `SPIN_DURATION_MS` と同じ（#94 と同じ長さ）。
 */
export function spinDurationMs(pickCount: number): number {
  return pickStopsMs(pickCount).at(-1) ?? SPIN_DURATION_MS;
}
