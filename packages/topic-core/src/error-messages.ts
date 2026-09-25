import type { TopicErrorCode } from "./schemas.js";

/**
 * お題の接続へ返すエラーの文言(#91)。
 *
 * **お題ツールが画面に出す文なので、書体の常用の層（base）に収める**
 * （`apps/topic-web/tests/copy-fits-font-base.test.ts` が守る）。PR 1 では「timer に同じコードが
 * あるものは timer と同じ文にする」としていたが、timer の `RATE_LIMITED` / `AI_UNLOCK_FAILED` は
 * base 層に無い字を含むので、#91 PR 2 で揃えるのをやめた。timer の `AI_UNLOCK_FAILED` は #91 PR 3 で
 * 解錠の経路ごと消えた。`RATE_LIMITED` は timer に残る（`room.join` の枠など）が、文は揃えない。
 * `MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は接続層（`ws-adapter.ts` の `MESSAGE_TOO_LARGE_TEXT` /
 * `INTERNAL_ERROR_TEXT`）と同じ文にする。
 */
const TOPIC_ERROR_MESSAGES: Record<TopicErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "続けて失敗しました。しばらく待ってから再試行してください。",
  AI_UNLOCK_FAILED: "合言葉が正しくありません。",
  GENERATION_COOLDOWN: "しばらく待ってから、もう一度作ってください。",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
};

export function topicErrorMessageFor(code: TopicErrorCode): string {
  return TOPIC_ERROR_MESSAGES[code];
}
