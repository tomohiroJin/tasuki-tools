/**
 * ドメインエラー定義
 * FR-010, FR-017
 */

/** メンバー名が空 */
export interface EmptyName {
  type: "EmptyName";
}

/** メンバー名が重複 */
export interface DuplicateName {
  type: "DuplicateName";
  name: string;
}

/** メンバー上限超過 */
export interface MemberLimitExceeded {
  type: "MemberLimitExceeded";
  limit: number;
}

/** 最小人数割れ */
export interface BelowMinMembers {
  type: "BelowMinMembers";
  min: number;
}

/** 権限不足 */
export interface Unauthorized {
  type: "Unauthorized";
  command: string;
  requiredRole: string;
}

/** フェーズ競合 */
export interface PhaseConflict {
  type: "PhaseConflict";
  currentPhase: string;
  requiredPhase: string;
}

/** 無効な交代間隔 */
export interface InvalidInterval {
  type: "InvalidInterval";
  value: number;
  allowed: number[];
}

/** 無効なインデックス */
export interface InvalidIndex {
  type: "InvalidIndex";
  index: number;
  max: number;
}

/** 入力サイズが上限超過（メンバー数とは別。お題の要件数などの配列長制限に使う） */
export interface InputLimitExceeded {
  type: "InputLimitExceeded";
  /** どの入力か（例: "requirements"） */
  field: string;
  limit: number;
}

/** ドメインエラーの合併型 */
export type DomainError =
  | EmptyName
  | DuplicateName
  | MemberLimitExceeded
  | BelowMinMembers
  | Unauthorized
  | PhaseConflict
  | InvalidInterval
  | InvalidIndex
  | InputLimitExceeded;
