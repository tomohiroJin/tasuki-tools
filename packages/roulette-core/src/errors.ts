/**
 * ルーレットのエラーコード（#94）。
 *
 * **エラー値は判別子だけを持ち、文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。
 * 文言は `error-messages.ts` が持つ。
 */

/** ドメインの遷移関数が返すコード */
export type RouletteDomainErrorCode =
  | "ROULETTE_SPINNING"
  | "ROULETTE_TOO_FEW"
  | "ROULETTE_TOO_MANY"
  | "TOO_MANY_GUESTS"
  | "GUEST_NAME_TAKEN"
  /** 選ぶ人数が 1〜MAX_PICK の外（#401） */
  | "INVALID_PICK_COUNT"
  /** 選ぶ人数が 2 以上で、入る人が選ぶ人数 + 1 に満たない（#401。1 のときは ROULETTE_TOO_FEW） */
  | "ROULETTE_TOO_FEW_FOR_PICK"
  /** 順番に回す回の途中で、決め方を変えようとした（#401 順番に回す T8） */
  | "ROULETTE_ROUND_IN_PROGRESS"
  /** 押して止めるとき、送られた位置の形が外れている（#401 押して止める P4） */
  | "ROULETTE_STOP_INVALID"
  /** 乱数源が契約（SETTLE_MIN〜SETTLE_MAX）を破った。サーバーの内部の誤りで、利用者の操作では起きない */
  | "INVALID_SETTLE"
  /** 乱数源が契約（`randomInt(n)` は `[0, n)`）を破った。`INVALID_SETTLE` と同じく内部の誤り（#364） */
  | "INVALID_RANDOM";

/**
 * ドメインの遷移関数が返すエラー。型引数でその関数が返しうるコードへ絞る
 * （`addGuest` は `INVALID_SETTLE` を返さない —— 呼び出し側に到達しない分岐を書かせない）。
 */
export type RouletteError<C extends RouletteDomainErrorCode = RouletteDomainErrorCode> = { code: C };

/**
 * ルーレットの接続へ、**ルーレットのメッセージ層（`roulette-handlers.ts` の `fail`）と接続層
 * （`ws-adapter.ts` の `sendRouletteFrame`）が返すコード**（wire）。どちらも型でこの列挙に縛られている。
 * ドメインのコードのうち `INVALID_SETTLE`・`INVALID_RANDOM` は内部の誤りなので載せず、`INTERNAL_ERROR` で返す。
 *
 * **参加の失敗（`ROOM_NOT_FOUND`・`JOIN_RATE_LIMITED`・合言葉の誤りなど）は載せない。** それらは
 * `join-room.ts` が返すハブのコード体系で、ハブと同じ形（`HubServerMsg` の `error`）で届く。お題（#91）の
 * `TOPIC_ERROR_CODES` と同じ線引きで、web は `roulette` → ハブの形（`HubServerMsgSchema`）の順に見分けて
 * 受け取る（`apps/topic-web/src/server-message.ts` と同じ形・spec §5.3）。
 * 使わないコードは載せない（文言表と web の分岐が死んだまま残る）。
 */
export const ROULETTE_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "MESSAGE_TOO_LARGE",
  // 接続層(ws-adapter.ts)がハンドラの同期例外・reject を隔離した結果を伝えるコード。
  "INTERNAL_ERROR",
  "ROULETTE_SPINNING",
  "ROULETTE_TOO_FEW",
  "ROULETTE_TOO_MANY",
  "INVALID_GUEST_NAME",
  "GUEST_NAME_TAKEN",
  "TOO_MANY_GUESTS",
  "INVALID_PICK_COUNT",
  "ROULETTE_TOO_FEW_FOR_PICK",
  "ROULETTE_ROUND_IN_PROGRESS",
  "ROULETTE_STOP_INVALID",
] as const;
export type RouletteErrorCode = (typeof ROULETTE_ERROR_CODES)[number];
