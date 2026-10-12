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
