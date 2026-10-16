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
 * k 人を選ぶ回転の全体の長さ（ms）。**サーバーの回転中の判定と wire の `durationMs` の正本**（#401 spec §5.1）。
 * k = 1 では `SPIN_DURATION_MS` と同じ（#94 と同じ長さ）。
 */
export function spinDurationMs(pickCount: number): number {
  return SPIN_DURATION_MS + (pickCount - 1) * (STOP_HOLD_MS + NEXT_MOVE_MS);
}
