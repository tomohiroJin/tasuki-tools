/**
 * 会の始まりと終わりの札のエラーコード（#406）。
 *
 * **エラー値は判別子だけを持ち、文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。
 */

export const CHECKIN_DOMAIN_ERROR_CODES = [
  "CHECKIN_NO_ROUND",
  "CHECKIN_REVEALED",
  "CHECKIN_SPECTATING",
  "CHECKIN_CARD_UNKNOWN",
  "CHECKIN_VISIBILITY_LOCKED",
  "CHECKIN_INVALID_RANDOM",
] as const;

export type CheckinDomainErrorCode = (typeof CHECKIN_DOMAIN_ERROR_CODES)[number];

export interface CheckinError<C extends CheckinDomainErrorCode = CheckinDomainErrorCode> {
  readonly code: C;
}
