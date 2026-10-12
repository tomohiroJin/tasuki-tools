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
  /** 乱数源が契約（SETTLE_MIN〜SETTLE_MAX）を破った。サーバーの内部の誤りで、利用者の操作では起きない */
  | "INVALID_SETTLE";

export type RouletteError = { code: RouletteDomainErrorCode };

/**
 * ルーレットの接続へ返しうるコード（wire）。
 * ドメインのコードのうち `INVALID_SETTLE` は内部の誤りなので載せず、`INTERNAL_ERROR` で返す。
 */
export const ROULETTE_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_COMMAND",
  "NOT_IN_ROOM",
  "RATE_LIMITED",
  "MESSAGE_TOO_LARGE",
  // 接続層(ws-adapter.ts)がハンドラの同期例外・reject を隔離した結果を伝えるコード。
  "INTERNAL_ERROR",
  "ROULETTE_SPINNING",
  "ROULETTE_TOO_FEW",
  "ROULETTE_TOO_MANY",
  "INVALID_GUEST_NAME",
  "GUEST_NAME_TAKEN",
  "TOO_MANY_GUESTS",
] as const;
export type RouletteErrorCode = (typeof ROULETTE_ERROR_CODES)[number];
