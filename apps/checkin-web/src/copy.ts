/**
 * Check-in Cards の UI 文言のすべて（#406）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言（関数は仮の名前で呼んだ結果）だけを書体の常用の層（base）に当てて守っている。
 * 直書きした文言はその検査を素通りする。足す・変えるときは `outsideBase` で実測してから使う。
 */

export const LOADING_TEXT = '読み込んでいます…';
export const JOINING_HEADING = 'ルームに参加しています';
export const GONE_HEADING = 'ルームが見つかりません';
export const GONE_TEXT = 'ルームは終了したか、リンクが正しくない可能性があります。';
export const GONE_LINK = 'トップへ戻る';

export const PAGE_HEADING = 'Check-in Cards';

/** 操作の失敗の一言を閉じる */
export const CLOSE_BUTTON = '閉じる';

/** 参加の失敗のうち、サーバーの文言を持たない（または空の）ときの既定。 */
export const DEFAULT_ERROR_TEXT = '操作を完了できませんでした';

// 接続の告知（poker-web の `connection-notice.ts` と同じ文。3 つとも base 層に収まる）
export const RECONNECTING_TEXT = '接続中です…（切断された場合は自動で再接続します）';
export const UNREACHABLE_TEXT =
  '同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。';
export const STALE_TEXT = '同期できていません。表示が最新でない可能性があります。';

// 混雑で参加を拒まれたとき。**poker の「混み合っています」を写さない**（「混」「雑」が base 層外）
export const RETRY_WAITING_TEXT = '参加を待っています。自動で入り直しています…';
export const RETRY_EXHAUSTED_TEXT = '参加できません。時間をおいてから再読込してください';

/** お題の枠の小見出し（やり方の側）。英字なので base 層の外に出ない */
export const SIDE_KICKER = { checkin: 'CHECK-IN', checkout: 'CHECK-OUT' } as const;

// ---- 卓の画面（#406 3.3） ----
/** 札の左上の一語（道具の印） */
export const CARD_MARK = '始終';
export const SIDE_LABEL = { checkin: 'チェックイン', checkout: 'チェックアウト' } as const;
export const METHOD_PICKER_HEADING = 'やり方を選んでください';
export const RANDOM_LABEL = 'ランダム';
export const BACK_LABEL = '戻る';
export const CHANGE_METHOD = '別のやり方';
export const VISIBILITY_GROUP_LABEL = '公開の仕方';
export const VISIBILITY_LABEL = { named: '名前つき', anonymous: '匿名' } as const;
export const SEATS_LABEL = '席';
export const YOU_MARK = '（あなた）';
export const SEAT_PLAYED_SR = '出しました';
export const SEAT_WAITING_SR = 'まだです';
export const HAND_GROUP_LABEL = 'あなたの札';
export const SPECTATING_TEXT = '見学中です。札は出しません。';
export const SPECTATE = '見学する';
export const STOP_SPECTATING = '見学をやめる';
export const REVEAL_NOW = '待たずに開く';
export const PLAY_AGAIN = 'もう一回';
export function playedCountText(played: number, total: number): string {
  return `${played} / ${total} 人が出しました`;
}
export function spectatorCountText(count: number): string {
  return `見学 ${count} 人`;
}
