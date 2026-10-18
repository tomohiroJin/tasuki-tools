/**
 * 見積もりの記録（#93・spec §4.1）の画面の文言。
 *
 * **書体の base 層に収める**（2026-10-17 に実測。`tests/estimate-copy-fits-font-base.test.ts` が守る）。
 * 「点」「目」「枚」「時刻」「上限」「無」「長」は base 層に無いので使わない。
 * サーバーのエラー文言（`estimate-not-found` / `estimate-open`）は `poker-core` の
 * `messageForRoundError` が持つので、ここには置かない。
 */
export const ESTIMATE_LOG_HEADING = '見積もりの記録';
export const ESTIMATE_ITEM_LABEL = 'いま見積もっているもの';
export const ESTIMATE_ITEM_PLACEHOLDER = '例: PROJ-123 ログイン画面';
export const ESTIMATE_UNNAMED = '（名前なし）';
export const ESTIMATE_OPEN = '見積もり中';
export const ESTIMATE_NO_POINTS = 'ポイントなし';
export const ESTIMATE_POINTS_LABEL = 'ポイント（任意）';
export const ESTIMATE_CHANGE_POINTS = 'ポイントを変える';
export const NEXT_ITEM = '次のアイテムへ';
export const REVOTE = '再投票';
export const ESTIMATE_LOG_EMPTY = '開票すると、ここに残ります';
export const ESTIMATE_LOG_SHOW_ALL = '記録をすべて見る';

/** 同じアイテムの n 回めの開票。数字の後に半角空白を置く。 */
export function attemptLabel(n: number): string {
  return `${n} 回め`;
}
