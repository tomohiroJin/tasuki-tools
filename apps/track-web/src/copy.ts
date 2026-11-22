/**
 * うちわけの UI 文言のすべて（#476）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言（関数は仮の値で呼んだ結果）を書体の常用の層（base）に当てて守る。
 * 利用者が入れる作業名は判定の外。上限の数は `@tasuki/track-core` の定数から組む（直書きしない）。
 */

export const PAGE_HEADING = 'うちわけ';

// 名前（作業名の代わりに出す語）
export const UNNAMED_NAME = '（名前なし）';
export const BREAK_NAME = '休憩';
export const KIND_WORK = '作業';
export const KIND_BREAK = '休憩';

// いまやっていること
export const NOW_HEADING = 'いまやっていること';
export const NOW_IDLE = '計測していません';
export const INTRO_TEXT = '作業を切り替えるたびに押します。終わったら Markdown で持ち帰れます。ルームを閉じると記録は消えます。';
export const ELAPSED_LABEL = '経過';
export const STOP_BUTTON = '止める';
export const BREAK_BUTTON = '休憩にする';

// 取り消し
export const UNDO_BUTTON = '取り消す';
export const UNDO_NOTE_START = '切り替えました。';
export const UNDO_NOTE_STOP = '止めました。';
export const UNDO_NOTE_CLEAR = '記録を消しました。';
export const undoRemaining = (seconds: number): string => `残り ${seconds} 秒`;

// 切り替える
export const SWITCH_HEADING = '切り替える';
export const LABEL_FIELD = '作業名';
export const LABEL_PLACEHOLDER = '空のままでも始められます';
export const SWITCH_BUTTON = '切り替える';
export const START_BUTTON = '開始';
export const BACK_FIELD = 'いつから';
export const BACK_NOW = 'いまから';
export const backOption = (minutes: number): string => `${minutes} 分前から`;
export const CANDIDATES_LABEL = '候補';
export const CANDIDATES_HINT = '数字キーでも切り替えられます。S で止める、C で直前の作業へ戻る。';
export const TOPIC_MARK = 'お題';
export const pinLabel = (label: string): string => `「${label}」を定番に固定する`;

// ここまでのうちわけ
export const TOTALS_HEADING = 'ここまでのうちわけ';
export const TOTALS_EMPTY = 'まだ記録がありません。';
export const COLUMN_NAME = '作業';
export const COLUMN_TIME = '時間';
export const COLUMN_RATIO = '割合';
export const WORK_TOTAL = '作業の合計';
export const GRAND_TOTAL = '全体';
export const percentText = (percent: number): string => `${percent}%`;

// 時系列
export const TIMELINE_HEADING = '時系列';
export const TIMELINE_EMPTY = '区切りはまだありません。';
export const RUNNING_MARK = '計測中';
export const AUTO_CLOSED_MARK = '自動で停止';
export const unnamedPrompt = (count: number): string => `名前のない区切りが ${count} 件あります。「直す」から名前を付けられます。`;
export const EDIT_BUTTON = '直す';
export const EDIT_CLOSE_BUTTON = '閉じる';
export const editLabel = (range: string, name: string): string => `${range} ${name} を直す`;

// 直す
export const EDIT_NAME_FIELD = '作業名';
export const EDIT_KIND_FIELD = '種類';
export const EDIT_APPLY_BUTTON = '名前と種類を変える';
export const EDGE_START = '始まり';
export const EDGE_END = '終わり';
export const stepText = (sign: string, minutes: number): string => `${sign}${minutes} 分`;
export const stepLabel = (edge: string, step: string): string => `${edge}を ${step}`;
export const edgeTimeLabel = (edge: string): string => `${edge}の時刻`;
export const EDGE_SET_BUTTON = 'この時刻にする';
export const EDGE_OUT_OF_RANGE = 'この時刻へは動かせません。';
export const SPLIT_HEADING = '途中で分ける';
export const SPLIT_TIME_FIELD = '分ける時刻';
export const SPLIT_NAME_FIELD = '後半の作業名';
export const SPLIT_BUTTON = 'ここで分ける';
export const SPLIT_OUT_OF_RANGE = 'この区切りの中の時刻を入れてください。';
export const REMOVE_BUTTON = '消す';

// 抜けを足す
export const INSERT_BUTTON = '抜けを足す';
export const INSERT_HEADING = '抜けていた時間を足す';
export const INSERT_NOTE = '重なる区切りは、足した区切りで上書きします。';
export const INSERT_START_FIELD = '始まり';
export const INSERT_MODE_FIELD = '時間の指定';
export const INSERT_MODE_END = '始まりと終わり';
export const INSERT_MODE_LENGTH = '始まりと長さ';
export const INSERT_END_FIELD = '終わり';
export const INSERT_LENGTH_FIELD = '長さ（分）';
export const INSERT_SUBMIT = '足す';
export const INSERT_CANCEL = 'やめる';
export const INSERT_ERROR_TIME = '時刻を入れてください。';
export const INSERT_ERROR_LENGTH = '長さは 1 分以上の整数で入れてください。';
export const INSERT_ERROR_ORDER = '終わりは始まりより後にしてください。';
export const INSERT_ERROR_FUTURE = 'いまより先の時間は足せません。';

// 持ち帰り
export const COPY_BUTTON = 'Markdown でコピー';
export const COPY_DONE = 'コピーしました';
export const COPY_FAILED = 'コピーできませんでした。下の欄から選んでコピーしてください。';
export const COPY_MANUAL_FIELD = 'うちわけの Markdown';
export const CLEAR_BUTTON = '記録を消す';
export const CLEAR_CONFIRM_TEXT = '全員の画面から記録を消しますか';
export const CLEAR_CONFIRM_YES = '消す';
export const CLEAR_CONFIRM_NO = 'やめる';

// 知らせ
export const resumeOfferText = (name: string, clock: string): string => `全員が離れたので「${name}」を ${clock} で止めました。`;
export const RESUME_BUTTON = '再開する';
export const DISMISS_BUTTON = 'このまま';
export const longRunningText = (name: string, minutes: number): string =>
  `「${name}」が ${minutes} 分続いています。切り替え忘れではありませんか`;

// 読み上げ（切り替え・停止・自動の停止のときだけ差し替える）
export const announceStarted = (name: string): string => `${name} を計測しています`;
export const ANNOUNCE_STOPPED = '計測を止めました';
export const ANNOUNCE_AUTO_STOPPED = '全員が離れたので、計測を自動で止めました';

// タブの題
export const tabTitle = (name: string, duration: string): string => `${name} ${duration}｜${PAGE_HEADING}`;

// 画面の下の 1 行
export const FOOTNOTE = 'この記録はルームの全員に見えます。ルームを閉じると消えます。';

// 操作の失敗・接続
export const CLOSE_BUTTON = '閉じる';
export const DEFAULT_ERROR_TEXT = '操作を完了できませんでした';
export const RETRY_WAITING_TEXT = '参加を待っています。自動で入り直しています…';
export const RETRY_EXHAUSTED_TEXT = '参加できません。時間をおいてから再読込してください';
