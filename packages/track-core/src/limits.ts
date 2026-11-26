/**
 * うちわけの上限と既定値（#476）。**値の正本はここ。** 時間はすべて ms の整数。
 */

/** 作業名の最大文字数（正規化した後で数える） */
export const MAX_LABEL = 80;
/**
 * 境界で受ける作業名の長さ（正規化の前）。前後の空白と、正規化で縮む文字のぶんの余裕を持たせた粗い上限。
 * 正規化した後の長さは `MAX_LABEL` で見る。
 */
export const MAX_LABEL_INPUT = MAX_LABEL * 4;
/** 境界で受ける時刻軸の位置の絶対値の上限（約 3 年。桁外れの値を落とすためだけの粗い上限） */
export const MAX_POSITION_MS = 100_000_000_000;
/** 区切りの最大数（5 分ごとに切り替えて 16 時間分） */
export const MAX_SEGMENTS = 200;
/** 端末に残せる記録の最大数（#476 第 2 段 B3）。超える保存では、いちばん古い 1 件を消す */
export const MAX_SAVED_RECORDS = 50;
/** 定番に固定できる作業名の最大数 */
export const MAX_PINNED = 9;
/** 候補の最大数（数字キー 1〜9 に合わせる） */
export const MAX_CANDIDATES = 9;

/** さかのぼりの刻み（分） */
export const BACK_MINUTES = [1, 5, 10, 15] as const;
/** さかのぼりの刻み（分）の型 */
export type BackMinutes = (typeof BACK_MINUTES)[number];

/** 取り消せる時間 */
export const UNDO_WINDOW_MS = 10_000;
/** 同じ区切りがこれだけ続いたら、止め忘れの知らせを出す */
export const LONG_RUNNING_NOTICE_MS = 90 * 60_000;
/** 区切りの最短の長さ。これに満たない区切りは残さない */
export const MIN_SEGMENT_MS = 1_000;
/** 手直しで置ける範囲（「いま」からどこまで前か） */
export const MAX_LOOKBACK_MS = 24 * 60 * 60_000;
