// テーブルを読み込めなかったときの文言（#403）。**初回の塊に入る**（遅延読み込みの塊が取れないときに出すため）。
// 「見積もりに戻る」はテーブルと同じ文言なので、ここを正本にして `card-table-copy.ts` が読み直す。
export const TABLE_LOAD_FAILED = 'トランプのポーカーを読み込めませんでした';
export const RELOAD = '読み込み直す';
export const BACK_TO_ESTIMATE = '見積もりに戻る';
