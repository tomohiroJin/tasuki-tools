/**
 * 進行タイマーの UI 文言のすべて（#429）。
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

export const PAGE_HEADING = '進行タイマー';
export const BACK_LINK = '選択画面へ戻る';

// 主の操作
export const START_BUTTON = '開始';
export const NEXT_BUTTON = '次へ';
export const PAUSE_BUTTON = '一時停止';
export const RESUME_BUTTON = '再開';
export const RESET_BUTTON = '最初から';

// 延長
export const EXTEND_LABEL = 'このステップに';
export const extendButton = (minutes: number): string => `+${minutes} 分`;

// 飛ばす
export const SKIP_BUTTON = 'スキップ';
export const UNSKIP_BUTTON = '戻す';

// 時間切れの振る舞い
export const ON_TIMEOUT_WAIT = '押すまで待つ';
export const ON_TIMEOUT_ADVANCE = '自動で次へ';

// 盤
export const OVERRUN_LABEL = 'オーバー';
export const PAUSED_LABEL = '一時停止中';
export const ON_PLAN_LABEL = '予定どおり';
export const driftText = (sign: '+' | '−', minutes: number): string => `予定より ${sign}${minutes} 分`;
export const projectedEndText = (clock: string): string => `${clock} に終了見込み`;
/** 盤の下の一行の前半（次のステップの名前は利用者の入力） */
export const nextStepText = (name: string): string => `次は ${name}`;
export const FOOTER_SEPARATOR = ' ・ ';
// 開始前の盤（中央の名前の段と押し巻きの段）
export const stepCountText = (count: number): string => `今日の進行 ${count} ステップ`;
export const NOT_STARTED_LABEL = '開始前';
// 読み上げの要約（盤の SVG と中央の文字は aria-hidden。同じ情報を文にする）
export const remainingSummary = (minutes: number): string => `残り ${minutes} 分`;
export const overrunSummary = (minutes: number): string => `オーバー ${minutes} 分`;
export const plannedSummary = (minutes: number): string => `予定 ${minutes} 分`;
export const FINISHED_LABEL = '終了';
export const SUMMARY_SEPARATOR = '、';

// 組む画面
export const ADD_STEP_BUTTON = 'ステップを追加';
export const MOVE_UP_BUTTON = '上へ';
export const MOVE_DOWN_BUTTON = '下へ';
export const MINUTES_UNIT = '分';
export const SAMPLE_TITLE = 'サンプル：KPT のふりかえり';
export const SAVE_LOCAL_BUTTON = 'この端末に保存';
export const LOAD_TO_ROOM_BUTTON = 'ルームに読み込む';
export const SCENARIO_CHANGED_NOTE = 'シナリオが変わりました';

// 確認
export const RESET_CONFIRM_TEXT = '最初からやり直しますか';

// 終了
export const SPENT_LABEL = 'かかった時間';
export const PLANNED_LABEL = '予定';

// 音
export const SOUND_ON = '音あり';
export const SOUND_OFF = '音なし';

// 脇: 招待（玄関と同じ見出し）
export const INVITE_HEADING = '仲間を招く';
export const INVITE_COPY_BUTTON = '招待リンクをコピー';
export const INVITE_COPIED = 'コピーしました';
export const INVITE_COPY_FAILED = 'コピーできません（URL を選択してください）';
export const INVITE_URL_LABEL = '参加用 URL';

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
