/**
 * お題ツールの UI 文言のすべて（#91）。
 *
 * **画面（`.tsx`）に日本語を直書きしない。** `tests/copy-fits-font-base.test.ts` が、ここにある
 * 文言だけを書体の常用の層（base）に当てて守っている。直書きした文言はその検査を素通りする。
 *
 * spec の「掲げる」「本文」は base 層に無い字（掲・本・文）を含むので、画面では
 * 「このお題にする」「説明」と言う（計画「実測で spec から外したこと」・spec §10）。
 */
import type { Difficulty } from '@tasuki/topic-core';

export const LOADING_TEXT = '読み込んでいます…';
export const JOINING_HEADING = 'ルームに参加しています';
export const GONE_HEADING = 'ルームが見つかりません';
export const GONE_TEXT = 'ルームは終了したか、リンクが正しくない可能性があります。';
export const GONE_LINK = 'トップへ戻る';

export const PAGE_HEADING = 'お題';
export const BACK_LINK = '選択画面へ戻る';
// 招待リンク（poker の `InviteLink` と同じ文）
export const INVITE_COPY_BUTTON = '招待リンクをコピー';
export const INVITE_COPIED = 'コピーしました';
export const INVITE_COPY_FAILED = 'コピーできません（URL を選択してください）';

export const CURRENT_HEADING = 'いまのお題';
export const EMPTY_TEXT = 'お題はまだありません。書くか、作ってください。';
export const CLEAR_BUTTON = 'お題を下ろす';
export const GENERATING_TEXT = '作っています…';
export const DEGRADED_TEXT = 'AI で作れなかったため、定型のお題にしました。';

export const WRITE_HEADING = '書く';
export const TITLE_LABEL = 'タイトル';
export const BODY_LABEL = '説明（なくてもよい）';
export const SET_BUTTON = 'このお題にする';
export const REWRITE_BUTTON = '書き直す';

export const MAKE_HEADING = '作る';
export const LANGUAGE_LABEL = '言語';
export const DIFFICULTY_LABEL = '難易度';
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: '初級',
  medium: '中級',
  hard: '上級',
};
export const AI_BUTTON = 'AI で作る';
export const FALLBACK_BUTTON = '定型から選ぶ';
export const UNLOCK_LABEL = 'AI 生成の合言葉';
export const UNLOCK_BUTTON = '解錠する';

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
