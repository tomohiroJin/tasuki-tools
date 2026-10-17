import type { RouletteErrorCode } from "./errors.js";
import { MAX_GUESTS, MAX_WHEEL } from "./limits.js";

/**
 * ルーレットの接続へ返すエラーの文言(#94 spec §6.6)。
 *
 * **ルーレットが画面に出す文なので、書体の常用の層（base）に収める**
 * （`tests/error-messages.test.ts` が守る）。`MESSAGE_TOO_LARGE` / `INTERNAL_ERROR` は
 * 同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）と同じ文にする。
 * 一致は `apps/tasuki-sync/test/connection-error-text-sources.test.ts` が守る（#362）。
 * **上限の数は定数から組む**（直書きすると、上限を変えたときに画面だけが古い数を言い続ける）。
 */
const ROULETTE_ERROR_MESSAGES: Record<RouletteErrorCode, string> = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
  ROULETTE_SPINNING: "回っている間は回せません",
  ROULETTE_TOO_FEW: "2 人から回せます",
  ROULETTE_TOO_MANY: `${MAX_WHEEL} 人までで回せます`,
  INVALID_GUEST_NAME: "この名前は追加できません",
  GUEST_NAME_TAKEN: "この名前はすでにいます",
  TOO_MANY_GUESTS: `名前は ${MAX_GUESTS} 人まで追加できます`,
  INVALID_PICK_COUNT: "この人数は選べません",
  ROULETTE_TOO_FEW_FOR_PICK: "選ぶ人数の人より、入る人が要ります",
  ROULETTE_ROUND_IN_PROGRESS: "この回の途中は決め方を変えられません",
  ROULETTE_STOP_INVALID: "ここでは止められません",
};

export function rouletteErrorMessageFor(code: RouletteErrorCode): string {
  return ROULETTE_ERROR_MESSAGES[code];
}
