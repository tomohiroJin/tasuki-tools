/**
 * 見学（#419・設計 §5）の画面の文言。
 *
 * **書体の base 層に収める**（2026-10-18 に実測。`tests/spectator-copy-fits-font-base.test.ts` が守る）。
 * 「札」「簿」は base 層に無いので使わない。
 * サーバーのエラー文言（`spectating`）は `poker-core` の `messageForRoundError` が持つので、ここには置かない。
 */
export const SPECTATE = '見学する';
export const JOIN_VOTING = '投票に加わる';
export const SPECTATOR_BADGE = '見学';
export const SPECTATING_NOTE = '見学中です。投票には加わりません。';

/** 席の一覧の見出し。N は見学者を含む全員。見学者が居るときだけ内訳を添える。 */
export function participantsHeading(total: number, spectators: number): string {
  return spectators === 0 ? `参加者（${total}人）` : `参加者（${total}人・見学${spectators}人）`;
}
