import type { RouletteErrorCode } from "./errors.js";

/**
 * ルーレットの接続へ返すエラーの文言(#94 spec §6.6)。
 *
 * **ルーレットが画面に出す文なので、書体の常用の層（base）に収める**
 * （`tests/error-messages.test.ts` が守る）。`MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は
 * 接続層（`ws-adapter.ts` の `MESSAGE_TOO_LARGE_TEXT` / `INTERNAL_ERROR_TEXT`）と同じ文にする。
 */
const ROULETTE_ERROR_MESSAGES: Record<RouletteErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "続けて失敗しました。しばらく待ってから再試行してください。",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
  ROULETTE_SPINNING: "回っている間は回せません",
  ROULETTE_TOO_FEW: "2 人から回せます",
  ROULETTE_TOO_MANY: "24 人までで回せます",
  INVALID_GUEST_NAME: "この名前は追加できません",
  GUEST_NAME_TAKEN: "この名前はすでにいます",
  TOO_MANY_GUESTS: "名前は 12 人まで追加できます",
};

export function rouletteErrorMessageFor(code: RouletteErrorCode): string {
  return ROULETTE_ERROR_MESSAGES[code];
}
