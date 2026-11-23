/**
 * うちわけのエラーコード（#476）。
 *
 * **エラー値は判別子だけを持ち、文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。
 */

export const TRACK_DOMAIN_ERROR_CODES = [
  "TRACK_INVALID_LABEL",
  "TRACK_BACKDATE_TOO_FAR",
  "TRACK_FULL",
  "TRACK_INVALID_RANGE",
  "SEGMENT_NOT_FOUND",
  "SEGMENT_RUNNING",
  "PIN_LIMIT",
] as const;

export type TrackDomainErrorCode = (typeof TRACK_DOMAIN_ERROR_CODES)[number];

export interface TrackError<C extends TrackDomainErrorCode = TrackDomainErrorCode> {
  code: C;
}
