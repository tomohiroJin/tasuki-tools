/**
 * 進行タイマーの UI 文言のすべて（#429）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言（関数は仮の名前で呼んだ結果）だけを書体の常用の層（base）に当てて守っている。
 * 直書きした文言はその検査を素通りする。足す・変えるときは `outsideBase` で実測してから使う。
 */
import { MAX_ITEMS, MAX_PLANNED_STEPS, MAX_ROUNDS, MAX_TOTAL_SEC, MIN_ROUNDS, STEP_SEC_MAX, STEP_SEC_MIN } from '@tasuki/agenda-core';

export const LOADING_TEXT = '読み込んでいます…';
export const JOINING_HEADING = 'ルームに参加しています';
export const GONE_HEADING = 'ルームが見つかりません';
export const GONE_TEXT = 'ルームは終了したか、リンクが正しくない可能性があります。';
export const GONE_LINK = 'トップへ戻る';

export const PAGE_HEADING = '進行タイマー';

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
export const TODAY_PLAN_LABEL = '今日の進行';
export const stepCountShort = (count: number): string => `${count} ステップ`;
/** 盤では塊（`TODAY_PLAN_LABEL`・`stepCountShort`・回数 2 以上なら `roundsShort`）を別々に組み、語の中で折り返させない */
export const roundsShort = (rounds: number): string => `× ${rounds} 回`;
export const stepCountText = (count: number, rounds = 1): string =>
  rounds >= 2 ? `${TODAY_PLAN_LABEL} ${stepCountShort(count)} ${roundsShort(rounds)}` : `${TODAY_PLAN_LABEL} ${stepCountShort(count)}`;
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
/** サンプルの一覧の行の見出し（行ごとに会の名前で区別する） */
export const sampleTitle = (label: string): string => `サンプル：${label}`;
export const SAMPLE_TITLE = sampleTitle('KPT のふりかえり');
/** 組む画面の小さな開閉のボタン。押したときだけサンプルの一覧を開く（いつでも選べる） */
export const SAMPLE_MENU_BUTTON = 'サンプルから選ぶ';
/** 下書きに中身があるときに選んだら、その場で確かめる（黙って消さない） */
export const SAMPLE_REPLACE_CONFIRM = 'いまの下書きを消して読み込みますか';
export const SAMPLE_REPLACE_YES = '消して読み込む';
export const SAMPLE_REPLACE_NO = 'やめる';
export const SAVE_LOCAL_BUTTON = 'この端末に保存';
export const LOAD_TO_ROOM_BUTTON = 'ルームに読み込む';
export const SCENARIO_CHANGED_NOTE = 'シナリオが変わりました';
export const LOAD_FIRST_TEXT = 'ルームに読み込んでから開始できます';
export const BACK_TO_ROOM_SCENARIO_BUTTON = 'ルームのシナリオに戻す';
export const SCENARIO_TITLE_LABEL = '会の名前';
/** 行の部品の読み上げの名前（行の番号で区別する） */
export const stepNameLabel = (n: number): string => `ステップ ${n} の名前`;
export const stepMinutesLabel = (n: number): string => `ステップ ${n} の分`;
export const stepMinusLabel = (n: number): string => `ステップ ${n} を 1 分へらす`;
export const stepPlusLabel = (n: number): string => `ステップ ${n} を 1 分ふやす`;
export const stepTimeoutLabel = (n: number): string => `ステップ ${n} の時間切れ`;
export const stepMoveUpLabel = (n: number): string => `ステップ ${n} を上へ`;
export const stepMoveDownLabel = (n: number): string => `ステップ ${n} を下へ`;
export const stepRemoveLabel = (n: number): string => `ステップ ${n} を消す`;
export const REMOVE_BUTTON = '消す';
/** サンプルの札・保存済みの行の添え書き */
export const scenarioDetail = (steps: number, minutes: number, rounds: number): string =>
  rounds >= 2 ? `${steps} ステップ × ${rounds} 回・全部で ${minutes} 分` : `${steps} ステップ・${minutes} 分`;
export const MAX_STEPS_NOTE = `ステップは ${MAX_ITEMS} までです`;
// 「ルームに読み込む」を押せない理由（最初の 1 つだけ出す）
export const NEED_STEP_TEXT = 'ステップを追加してください';
export const TITLE_CONTROL_TEXT = '会の名前に改行やタブは使えません';
export const stepNameBlankText = (n: number): string => `ステップ ${n} の名前が空です`;
export const stepNameControlText = (n: number): string => `ステップ ${n} の名前に改行やタブは使えません`;
export const stepMinutesRangeText = (n: number): string =>
  `ステップ ${n} の分は ${STEP_SEC_MIN / 60}〜${STEP_SEC_MAX / 60} で入れてください`;
export const totalTooLongText = (minutes: number): string => `合計は ${MAX_TOTAL_SEC / 60} 分までです（いま ${minutes} 分）`;
// くりかえし（回数）
export const ROUNDS_LABEL = 'くりかえし';
export const ROUNDS_UNIT = '回';
export const roundsMinusLabel = `${ROUNDS_LABEL}を 1 回へらす`;
export const roundsPlusLabel = `${ROUNDS_LABEL}を 1 回ふやす`;
/** 盤の中央の回の札（例「2 / 6 回」）。回数 2 以上の進行中・一時停止中だけ出す */
export const roundBadgeText = (cur: number, total: number): string => `${cur} / ${total} ${ROUNDS_UNIT}`;
/** 進行表・終了の一覧の回の見出し（例「2 回」） */
export const roundHeading = (n: number): string => `${n} ${ROUNDS_UNIT}`;
export const roundsRangeText = (): string => `くりかえしは ${MIN_ROUNDS}〜${MAX_ROUNDS} 回で入れてください`;
/** ステップを足せないのが 60 の上限のとき */
export const MAX_PLANNED_NOTE = `ステップ × くりかえしは ${MAX_PLANNED_STEPS} までです`;
export const plannedStepsTooManyText = (count: number): string =>
  `ステップ × 回数は ${MAX_PLANNED_STEPS} までです（いま ${count}）`;
/** 合計の行の意味の塊（例「1 回あたり 8 分」「× 6 回」「＝ 全部で 48 分」。画面は塊を折り返さず、塊の間でだけ折る） */
export const perRoundSummaryParts = (perRoundMin: number, rounds: number, totalMin: number): string[] => [
  `1 回あたり ${perRoundMin} 分`,
  `× ${rounds} 回`,
  `＝ 全部で ${totalMin} 分`,
];
// 端末への保存
export const SAVED_HEADING = '保存済み';
export const SAVE_NAME_LABEL = '保存する名前';
export const SAVED_DONE = '保存しました';
export const savedRemoveLabel = (name: string): string => `${name} を消す`;
export const SAVE_FAILED_INVALID = '保存できません（名前とステップを見直してください）';
export const SAVE_FAILED_UNREADABLE = '保存済みの一覧を読めないため、保存を止めました';
export const SAVE_FAILED_WRITE = 'この端末に書き込めませんでした';

// 確認
export const RESET_CONFIRM_TEXT = '最初からやり直しますか';
export const RESET_CONFIRM_YES = 'やり直す';
export const RESET_CONFIRM_NO = 'やめる';

// 進める画面
export const STEP_LIST_HEADING = '進行表';
export const DONE_MARK = '済';
export const NOW_MARK = 'いま';
/** 進行表の行の分（延長があれば「7 分 + 3」と添える） */
export const minutesText = (minutes: number): string => `${minutes} 分`;
export const extensionSuffix = (minutes: number): string => ` + ${minutes}`;
/** 盤の下の添え書き（spec §7.2「予定 7 分 + 3 分」） */
export const extensionNote = (planned: number, extension: number): string => `予定 ${planned} 分 + ${extension} 分`;
/** 回数 2 以上では回を前に付ける（例「3 回のステップ 1 をスキップ」）。回数 1 は `round` を渡さない */
export const skipStepLabel = (n: number, round?: number): string =>
  `${round === undefined ? '' : `${round} 回の`}ステップ ${n} をスキップ`;
/** 1 ステップの回（朝会）では行が回そのもの（例「3 回をスキップ」） */
export const skipRoundLabel = (round: number): string => `${round} ${ROUNDS_UNIT}をスキップ`;
export const unskipRoundLabel = (round: number): string => `${round} ${ROUNDS_UNIT}を戻す`;
export const unskipStepLabel = (n: number, round?: number): string =>
  `${round === undefined ? '' : `${round} 回の`}ステップ ${n} を戻す`;

// 映す表示（spec §7.5）
export const PROJECT_BUTTON = '映す表示';
export const PROJECT_EXIT_BUTTON = '手元の表示に戻る';
export const PROJECT_KEYS_HINT = 'Space で一時停止・→ で次へ・Esc で戻る';
export const DRIFT_LABEL = '予定より';
export const NEXT_STEP_LABEL = '次';
export const PROJECTED_END_LABEL = '終了見込み';
/** 映す表示の右の列の押し巻き（見出し「予定より」の下に大きく） */
export const driftShortText = (sign: '+' | '−', minutes: number): string => `${sign}${minutes} 分`;

// 読み上げ（aria-live。spec §7.7 の 4 種と終了だけ）
export const announceStep = (name: string): string => `いまのステップは ${name}`;
export const TIMEOUT_ANNOUNCE = '時間切れです';
export const PAUSED_ANNOUNCE = '一時停止しました';
export const RESUMED_ANNOUNCE = '再開しました';
export const FINISHED_ANNOUNCE = '終了しました';
/** 盤の要約をいつでも聞くボタン（spec §7.7。押すと要約を読み上げの領域へ流す） */
export const SPEAK_SUMMARY_BUTTON = '読み上げ';

// 終了
export const SPENT_LABEL = 'かかった時間';
export const PLANNED_LABEL = '予定';
export const SUMMARY_STEP_LABEL = 'ステップ';
/** 延長の列（「延長」の字は base 層の外） */
export const SUMMARY_EXTENSION_LABEL = '追加';
export const extensionCell = (minutes: number): string => `+${minutes} 分`;
export const SUMMARY_TOTAL_LABEL = '合計';

// 音
export const SOUND_ON = '音あり';
export const SOUND_OFF = '音なし';
/** 「音あり」を覚えているが、開き直して解錠されていない（押すと 1 回で有効になる） */
export const SOUND_LOCKED = '音を有効に';

/** 操作の失敗の一言を閉じる */
export const CLOSE_BUTTON = '閉じる';

/** 参加の失敗のうち、サーバーの文言を持たない（または空の）ときの既定。 */
export const DEFAULT_ERROR_TEXT = '操作を完了できませんでした';

// 混雑で参加を拒まれたとき。**poker の「混み合っています」を写さない**（「混」「雑」が base 層外）
export const RETRY_WAITING_TEXT = '参加を待っています。自動で入り直しています…';
export const RETRY_EXHAUSTED_TEXT = '参加できません。時間をおいてから再読込してください';
