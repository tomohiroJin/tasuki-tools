/**
 * 進行タイマーのエラーコード（#429）。
 *
 * **エラー値は判別子だけを持ち、文言を持たない**（`scripts/audit-domain-error-shape.mjs`）。
 */

export const AGENDA_DOMAIN_ERROR_CODES = [
  "AGENDA_EMPTY",
  "AGENDA_ALREADY_STARTED",
  "AGENDA_NOT_STARTED",
  "AGENDA_IN_PROGRESS",
  "AGENDA_FINISHED",
  "STEP_NOT_FOUND",
  "STEP_NOT_SKIPPABLE",
  "STEP_BUDGET_EXCEEDED",
  "INVALID_SCENARIO",
] as const;

export type AgendaDomainErrorCode = (typeof AGENDA_DOMAIN_ERROR_CODES)[number];

export interface AgendaError<C extends AgendaDomainErrorCode = AgendaDomainErrorCode> {
  code: C;
}
