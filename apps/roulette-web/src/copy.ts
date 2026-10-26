/**
 * ルーレットの UI 文言のすべて（#94 spec §6.6）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言（関数は仮の名前で呼んだ結果）だけを書体の常用の層（base）に当てて守っている。
 * 直書きした文言はその検査を素通りする。
 *
 * 使えない字がある（spec §2）: 「当たる」→「選ばれる」・「一巡」→「一周」・「名前を足す」→「名前を追加」・
 * 「候補」→「入る人」。「誰」は使わない。「以上」の「以」も外れる（「24 人まで」と書く）。
 */

export const LOADING_TEXT = '読み込んでいます…';
export const JOINING_HEADING = 'ルームに参加しています';
export const GONE_HEADING = 'ルームが見つかりません';
export const GONE_TEXT = 'ルームは終了したか、リンクが正しくない可能性があります。';
export const GONE_LINK = 'トップへ戻る';

export const PAGE_HEADING = '進行役ルーレット';
/** 舞台（操作の面）の見出し。目には出さず、領域の名前にする */
export const STAGE_HEADING = 'ルーレット';

// お題の添え書き（お題が無ければ出さない）
export const topicNoteText = (title: string): string => `お題「${title}」の進行役を決めます`;

// 主ボタン
export const SPIN_BUTTON = 'ルーレットを回す';
export const SPINNING_BUTTON = '回しています…';
export const SPIN_AGAIN_BUTTON = 'もう一度回す';

// 結果の札（表。円盤の指し針が差し出す 1 枚）。読み上げは一言が持つので札は aria-hidden
export const CARD_LABEL = '次の進行役';
export const CARD_SUFFIX = 'さん';

// 結果の一言（role="status"）
export const CAPTION_IDLE = '回すと、次の進行役が決まります';
export const spunByText = (name: string): string => `${name} さんが回しました`;
export const resultText = (name: string): string => `次の進行役は ${name} さんです`;
export const TOO_FEW_TEXT = '2 人から回せます';

// 脇: ルーレットに入る人
export const PEOPLE_HEADING = 'ルーレットに入る人';
export const SELF_SUFFIX = '（あなた）';
export const AWAY_MARK = '離席中';
/** 在室者と同じ名前のゲスト（入る人から外れている）の印 */
export const TWIN_MARK = '同じ名前の人がいます';
export const GUEST_HINT = 'ルームにいない人も、名前を追加すれば入れられます';
export const GUEST_ADD_BUTTON = '名前を追加';
export const GUEST_REMOVE_BUTTON = '名前を消す';
export const guestRemoveLabel = (name: string): string => `${name} の名前を消す`;

// 2 人以上を選ぶ（#401 spec §6.5。1 人のときは上の文言のまま）
/** 脇の「選ぶ人数」の切り替え */
export const PICK_COUNT_LABEL = '選ぶ人数';
export const pickCountOption = (k: number): string => `${k} 人`;
/** 組の札の見出し */
export const groupCardLabel = (k: number): string => `選ばれた ${k} 人`;
export const groupIdleText = (k: number): string => `回すと、${k} 人が決まります`;
/** 結果の一言（止まった順に並べる） */
export const groupResultText = (...names: string[]): string =>
  `選ばれたのは ${names.map((n) => `${n} さん`).join('、')}です`;
/** 入る人が選ぶ人数 + 1 に満たない */
export const tooFewForPickText = (k: number): string => `${k + 1} 人から回せます`;
export const groupTopicNoteText = (title: string, k: number): string => `お題「${title}」の ${k} 人を決めます`;

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

// 決め方（#401 順番に回す spec §5.2）
export const MODE_HEADING = '決め方';
export const MODE_ONCE = '1 回で決める';
export const MODE_ORDER = '順番に回す';
export const ONCE_NOTE = '1 回回して、選ぶ人数ぶんを決めます';
/** 順番に回すときの説明（決め方の面）と、回す前の一言 */
export const ORDER_NOTE = '選ばれた人から順に抜けていきます';
export const ORDER_BUTTON = '次の人を決める';
export const ORDER_LAST_BUTTON = '最後の 1 人';
export const ORDER_NEW_ROUND_BUTTON = '次の回を始める';
/** 札の見出し・脇の一覧の印 */
export const turnLabel = (n: number): string => `${n} 番`;
export const turnResultText = (n: number, name: string): string => `${n} 番は ${name} さんです`;
export const orderLastText = (name: string): string => `最後は ${name} さんです`;
export const ORDER_NOT_STARTED = 'まだ回していません';
export const orderProgressText = (done: number, left: number): string => `${done} 人済み・あと ${left} 人`;
export const ORDER_ALL_DONE = '全員の順番が決まりました';
export const ORDER_RESET_BUTTON = '最初からやり直す';

// 押して止める（#401 押して止める spec §4.1）
export const MODE_PRESS = '止めて決める';
/** 決め方の面の説明 */
export const PRESS_NOTE = '回っているルーレットを、押した瞬間に止めて決めます';
export const PRESS_IDLE = '止めたところの人に決まります';
export const PRESS_SPINNING = '止めると、指している人に決まります';
export const STOP_BUTTON = '止める';
export const pressStoppedText = (by: string): string => `${by} さんが止めました`;
export const PRESS_AUTO_TEXT = '止める人がいませんでした';
/** 止まった後の一言の読み上げにだけ足す（名前は札が出す） */
export const pressDecidedText = (name: string): string => `。${name} さんに決まりました`;
