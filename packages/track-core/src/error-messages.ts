import { MAX_LABEL, MAX_PINNED, MAX_SEGMENTS } from "./limits.js";
import type { TrackErrorCode } from "./schemas.js";

/**
 * うちわけの接続へ返すエラーの文言（#476）。
 *
 * **画面に出す文なので、書体の常用の層（base）に収める**（`tests/error-messages.test.ts` が守る）。
 * `MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は同期サーバーの正本
 * （`apps/tasuki-sync/src/application/connection-errors.ts`）と同じ文にする。
 * **上限の数は定数から組む**（直書きすると、上限を変えたときに画面だけが古い数を言い続ける）。
 */
const TRACK_ERROR_MESSAGES: Record<TrackErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "しばらく待ってから操作してください",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
  TRACK_INVALID_LABEL: `作業名は ${MAX_LABEL} 字までです`,
  TRACK_BACKDATE_TOO_FAR: "前の区切りが始まるより前へは戻せません",
  TRACK_FULL: `区切りは ${MAX_SEGMENTS} 件までです`,
  TRACK_INVALID_RANGE: "この時間には置けません",
  SEGMENT_NOT_FOUND: "この区切りは見つかりません",
  SEGMENT_RUNNING: "計測中の区切りには使えません",
  PIN_LIMIT: `定番は ${MAX_PINNED} 件までです`,
};

export function trackErrorMessageFor(code: TrackErrorCode): string {
  return TRACK_ERROR_MESSAGES[code];
}
