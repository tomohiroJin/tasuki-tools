import type { CheckinErrorCode } from "./schemas.js";

/**
 * 会の始まりと終わりの札の接続へ返すエラーの文言（#406）。
 *
 * **画面に出す文なので、書体の常用の層（base）に収める**（`tests/error-messages.test.ts` が守る）。
 * 共通のコードは同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）と同じ文にする。
 */
const CHECKIN_ERROR_MESSAGES: Record<CheckinErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "しばらく待ってから操作してください",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
  CHECKIN_NO_ROUND: "まだ始まっていません",
  CHECKIN_REVEALED: "もう開いています",
  CHECKIN_SPECTATING: "見学中は札を出せません",
  CHECKIN_CARD_UNKNOWN: "この札は選べません",
  CHECKIN_VISIBILITY_LOCKED: "札が出たあとは公開の仕方を変えられません",
  CHECKIN_INVALID_RANDOM: "やり方を引けませんでした。もう一度試してください",
};

export function checkinErrorMessageFor(code: CheckinErrorCode): string {
  return CHECKIN_ERROR_MESSAGES[code];
}
