/**
 * ドメインイベント定義
 */

import type { SessionConfig, Problem, RoomPhase, ProblemMode } from "./aggregate.js";

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

/**
 * 現ドライバーのまま持ち時間だけを満タンからやり直す（再スタート・Issue #14）。
 * SessionReset（先頭・全カウント初期化）や DriverSwitched（人が変わる・回数加算）とは異なり、
 * currentIndex / driverCounts / totalSwitches を変えず clock のみ満タン再アンカーする。
 */
export interface DriverTimerReset {
  type: "DriverTimerReset";
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

/** メンバー追加（ローテーションは参加者IDで持つ・D6b） */
export interface MemberAdded {
  type: "MemberAdded";
  participantId: string;
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

/** メンバー順のシャッフル（サーバー権威で生成した順列を運ぶ） */
export interface MembersShuffled {
  type: "MembersShuffled";
  /** order[i] = 新しい i 番目に来る旧 rotation インデックス（順列）。 */
  order: number[];
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

/**
 * 中断（途中でやめる）
 * 記録を生成しない。締めくくり画面の表示のみを目的とする。
 */
export interface SessionAborted {
  type: "SessionAborted";
  now: number;
}

/** 代理参加者追加（Web 非接続の人をプレースホルダーとして追加） */
export interface ProxyMemberAdded {
  type: "ProxyMemberAdded";
  participantId: string;
  displayName: string;
  now: number;
}

/** 表示名変更 */
export interface ParticipantRenamed {
  type: "ParticipantRenamed";
  participantId: string;
  displayName: string;
  now: number;
}

/** ドライバー対象から一時離脱 */
export interface DriverSkipped {
  type: "DriverSkipped";
  participantId: string;
  now: number;
}

/** ドライバー対象に復帰 */
export interface DriverResumed {
  type: "DriverResumed";
  participantId: string;
  now: number;
}

/** お題の内容を編集（フィールド単位のパッチ） */
export interface ProblemEdited {
  type: "ProblemEdited";
  patch: {
    title?: string;
    description?: string;
    requirements?: string[];
    exampleTest?: string;
    hints?: string[];
  };
  now: number;
}

/** 出題モード変更（AI/定型） */
export interface ProblemModeSet {
  type: "ProblemModeSet";
  mode: ProblemMode;
  now: number;
}

/** ドメインイベントの合併型 */
export type DomainEvent =
  | SessionStarted
  | DriverSwitched
  | SessionPaused
  | SessionResumed
  | SessionReset
  | DriverTimerReset
  | PhaseSet
  | ConfigSet
  | MemberAdded
  | MemberRemoved
  | MemberMoved
  | MembersShuffled
  | ProblemSet
  | HandoffNoteSet
  | BreakStarted
  | BreakEnded
  | SessionCompleted
  | SessionAborted
  | ProxyMemberAdded
  | ParticipantRenamed
  | DriverSkipped
  | DriverResumed
  | ProblemEdited
  | ProblemModeSet;
