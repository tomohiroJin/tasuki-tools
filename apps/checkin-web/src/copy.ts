/**
 * Check-in Cards の UI 文言のすべて（#406）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言（関数は仮の名前で呼んだ結果）だけを書体の常用の層（base）に当てて守っている。
 * 直書きした文言はその検査を素通りする。足す・変えるときは `outsideBase` で実測してから使う。
 */

export const PAGE_HEADING = 'チェックイン・チェックアウト';

/** 操作の失敗の一言を閉じる */
export const CLOSE_BUTTON = '閉じる';

/** 参加の失敗のうち、サーバーの文言を持たない（または空の）ときの既定。 */
export const DEFAULT_ERROR_TEXT = '操作を完了できませんでした';

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
/** ランダムの札を置く、選択画面の末尾の小見出し（#635。やり方の小見出しは `method-groups.ts`） */
export const RANDOM_GROUP_TITLE = 'おまかせ';
/** 小見出しの行の、その小見出しの中から引くボタンの見える字（#635）。読み上げ名は `groupRandomLabel` */
export const GROUP_RANDOM_TEXT = 'ランダム';
/** 小見出しの中から引くボタンの読み上げ名（見える字「ランダム」を含む）。例「気分と元気からランダム」 */
export const groupRandomLabel = (groupTitle: string): string => `${groupTitle}から${GROUP_RANDOM_TEXT}`;
/** ランダムの箱に添える一言（伏せ札の見本の下） */
export const RANDOM_HINT = '引いて決める';
/** 選択画面から卓の画面へ戻るボタン。回は変わらない（#468） */
export const BACK_LABEL = 'いまの回に戻る';
/** 回があって選択画面を開いたときの添え書き。選ぶと `startRound` で新しい回になり、前の回の札は捨てられる（#468 D5） */
export const PICKER_REPLACE_NOTE = '選ぶと新しい回が始まります（いまの回の札は消えます）';
/** 側の切り替えの下の一文（どの場で使う一覧か・#468 D4） */
export const SIDE_HINT = { checkin: 'チェックインは会の始まりに使います', checkout: 'チェックアウトは会の終わりに使います' } as const;
export const CHANGE_METHOD = '別のやり方';
export const VISIBILITY_GROUP_LABEL = '公開の仕方';
export const VISIBILITY_LABEL = { named: '名前つき', anonymous: '匿名' } as const;
/** 公開の仕方が押せないときの理由（サーバーの CHECKIN_VISIBILITY_LOCKED の文と同じ） */
export const VISIBILITY_LOCKED_NOTE = '札が出たあとは公開の仕方を変えられません';
export const SEATS_LABEL = '席';
export const YOU_MARK = '（あなた）';
export const SEAT_PLAYED_SR = '出しました';
export const SEAT_WAITING_SR = 'まだです';
export const HAND_GROUP_LABEL = 'あなたの札';
export const SPECTATING_TEXT = '見学中です。札は出しません。';
export const SPECTATE = '見学する';
export const STOP_SPECTATING = '投票に加わる';
export const REVEAL_NOW = '待たずに開く';
export const PLAY_AGAIN = 'もう一回';
export function playedCountText(played: number, total: number): string {
  return `${played} / ${total} 人が出しました`;
}
export function spectatorCountText(count: number): string {
  return `見学 ${count} 人`;
}

// ---- 開いた後の画面（#406 3.5）。要約の行は `reveal-view.ts` ----
export const REVEAL_LABEL = '開いた札';
export const PILE_UNIT_SR = ' 人';

// ---- 結果の持ち出し（#676）。Markdown の文も、手で選ぶ欄に出るのでここに置き、base 層に収める ----
export const MD_COPY_BUTTON = 'Markdown でコピー';
export const MD_COPY_DONE = 'コピーしました';
export const MD_COPY_FAILED = 'コピーできませんでした。下の欄から選んでコピーしてください。';
/** コピーに失敗したとき、手で選んで持ち出す欄の名前（poker #653・track #476 と同じ作法） */
export const MD_COPY_MANUAL_FIELD = '結果の Markdown';
export const MD_HEADING = 'チェックイン・チェックアウトの記録';
export const MD_VISIBILITY_LABEL = '公開の仕方';
export const mdPeople = (count: number): string => `${count} 人`;

// ---- 札が開いたときのカットイン（#670。設計 `docs/superpowers/specs/2026-11-27-cutin-design.md` §4）。題は 9 字以下 ----
export const CUTIN_ALL_SAME = '全員同じ';
export const CUTIN_CHECKIN = 'チェックイン';
export const CUTIN_CHECKOUT = 'おつかれさまでした';
