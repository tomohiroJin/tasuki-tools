import type { AgendaErrorCode } from "./schemas.js";
import { MAX_ITEMS, MAX_STEP_BUDGET_SEC, MAX_TOTAL_SEC } from "./limits.js";

/**
 * 進行タイマーの接続へ返すエラーの文言（#429）。
 *
 * **画面に出す文なので、書体の常用の層（base）に収める**（`tests/error-messages.test.ts` が守る）。
 * `MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は同期サーバーの正本
 * （`apps/tasuki-sync/src/application/connection-errors.ts`）と同じ文にする。
 * **上限の数は定数から組む**（直書きすると、上限を変えたときに画面だけが古い数を言い続ける）。
 */
const AGENDA_ERROR_MESSAGES: Record<AgendaErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "しばらく待ってから操作してください",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
  AGENDA_EMPTY: "ステップがありません",
  AGENDA_ALREADY_STARTED: "もう始まっています",
  AGENDA_NOT_STARTED: "まだ始まっていません",
  AGENDA_IN_PROGRESS: "進行中はシナリオを変えられません",
  AGENDA_FINISHED: "もう終わっています",
  STEP_NOT_FOUND: "このステップは見つかりません",
  STEP_NOT_SKIPPABLE: "このステップはスキップできません",
  STEP_BUDGET_EXCEEDED: `1 つのステップは ${MAX_STEP_BUDGET_SEC / 60} 分までです`,
  INVALID_SCENARIO: `ステップは ${MAX_ITEMS} まで、合計 ${MAX_TOTAL_SEC / 60} 分までです`,
};

export function agendaErrorMessageFor(code: AgendaErrorCode): string {
  return AGENDA_ERROR_MESSAGES[code];
}
