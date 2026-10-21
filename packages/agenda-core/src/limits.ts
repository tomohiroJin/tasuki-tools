/**
 * 進行タイマーの上限（#429）。長さはすべて秒の整数。
 */

/** 定義の項目（ステップ）の最大数 */
export const MAX_ITEMS = 20;
/** ステップの名前の最大文字数 */
export const MAX_STEP_NAME = 40;
/** 会の名前の最大文字数（0 字は許す） */
export const MAX_SCENARIO_TITLE = 60;

/** 入力するステップの持ち時間の下限（秒） */
export const STEP_SEC_MIN = 60;
/** 入力するステップの持ち時間の上限（秒） */
export const STEP_SEC_MAX = 7200;
/** 入力するステップの持ち時間の刻み（秒） */
export const STEP_SEC_GRANULARITY = 60;

/** 予定の合計の上限（秒。180 分） */
export const MAX_TOTAL_SEC = 10800;
/** シナリオ全体を繰り返す回数の下限 */
export const MIN_ROUNDS = 1;
/** シナリオ全体を繰り返す回数の上限 */
export const MAX_ROUNDS = 30;
/** 回数で展開したあとの区切りの数の上限 */
export const MAX_PLANNED_STEPS = 60;

/** 延長を含めた 1 ステップの持ち時間の上限（秒。240 分） */
export const MAX_STEP_BUDGET_SEC = 14400;

/** 延長の刻み（分）。1 / 3 / 5 だけ */
export const EXTEND_MINUTES = [1, 3, 5] as const;
/** 延長の刻み（分）の型。画面の操作と同期の層はこれを使う（`EXTEND_MINUTES` から導く） */
export type ExtendMinutes = (typeof EXTEND_MINUTES)[number];
