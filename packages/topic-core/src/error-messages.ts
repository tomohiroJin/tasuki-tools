import type { TopicErrorCode } from "./schemas.js";

/**
 * お題の接続へ返すエラーの文言(#91)。
 *
 * **timer に同じコードがあるものは timer と同じ文にする**(`packages/timer-core/src/error-messages.ts`)。
 * 同じ事象に 2 つの言い回しを作ると、片方だけが直る。`MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は
 * 接続層(`ws-adapter.ts` の `MESSAGE_TOO_LARGE_TEXT` / `INTERNAL_ERROR_TEXT`)と同じ文にする。
 */
const TOPIC_ERROR_MESSAGES: Record<TopicErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "試行が多すぎます。しばらく待ってから再試行してください。",
  AI_UNLOCK_FAILED: "合言葉が違います。",
  GENERATION_COOLDOWN: "少し待ってから、もう一度作ってください。",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
};

export function topicErrorMessageFor(code: TopicErrorCode): string {
  return TOPIC_ERROR_MESSAGES[code];
}
