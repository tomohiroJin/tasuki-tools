/**
 * ドメインイベント定義
 */

import type { SessionConfig, Problem, RoomPhase } from "./aggregate.js";

/** セッション開始 */
export interface SessionStarted {
  type: "SessionStarted";
  now: number;
}

/** ドライバー交代 */
export interface DriverSwitched {
  type: "DriverSwitched";
  nextIndex: number;
  now: number;
}

/** 一時停止 */
export interface SessionPaused {
  type: "SessionPaused";
  now: number;
}

/** 再開 */
export interface SessionResumed {
  type: "SessionResumed";
  now: number;
}

/** リセット（集約は rotation/interval から再構成するため追加情報を持たない） */
export interface SessionReset {
  type: "SessionReset";
  now: number;
}

/** フェーズ遷移 */
export interface PhaseSet {
  type: "PhaseSet";
  phase: RoomPhase;
  now: number;
}

/** 設定変更（検証済みの部分設定のみを運ぶ。未指定フィールドは現状維持） */
export interface ConfigSet {
  type: "ConfigSet";
  config: Partial<SessionConfig>;
  now: number;
}

/** メンバー追加 */
export interface MemberAdded {
  type: "MemberAdded";
  name: string;
  now: number;
}

/** メンバー削除 */
export interface MemberRemoved {
  type: "MemberRemoved";
  index: number;
  now: number;
}

/** メンバー並べ替え */
export interface MemberMoved {
  type: "MemberMoved";
  fromIndex: number;
  toIndex: number;
  now: number;
}

/** お題確定 */
export interface ProblemSet {
  type: "ProblemSet";
  problem: Problem;
  usedFallback: boolean;
  now: number;
}

/** 引き継ぎメモ更新 */
export interface HandoffNoteSet {
  type: "HandoffNoteSet";
  text: string;
  now: number;
}

/** 休憩開始 */
export interface BreakStarted {
  type: "BreakStarted";
  now: number;
}

/** 休憩終了 */
export interface BreakEnded {
  type: "BreakEnded";
  now: number;
}

/** 完成 */
export interface SessionCompleted {
  type: "SessionCompleted";
  now: number;
}

/** ドメインイベントの合併型 */
export type DomainEvent =
  | SessionStarted
  | DriverSwitched
  | SessionPaused
  | SessionResumed
  | SessionReset
  | PhaseSet
  | ConfigSet
  | MemberAdded
  | MemberRemoved
  | MemberMoved
  | ProblemSet
  | HandoffNoteSet
  | BreakStarted
  | BreakEnded
  | SessionCompleted;
