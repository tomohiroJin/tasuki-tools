/**
 * ドメインイベント定義
 */

import type { RandomRotation, TimerConfig, RoomPhase } from "./aggregate.js";

/** セッション開始 */
interface SessionStarted {
  type: "SessionStarted";
  /** ランダム交代のモードで始めたときの袋（#660）。輪の順のモードでは載せない。 */
  randomRotation?: RandomRotation;
  now: number;
}

/** ドライバー交代 */
interface DriverSwitched {
  type: "DriverSwitched";
  nextIndex: number;
  /**
   * 交代のあとのランダム交代の袋（#660）。出す側（decide・`advanceDriver`）が決める。
   * 輪の順のモード・運転者が変わらない交代では載せない。evolve は、集約がランダム交代のときだけ使う。
   */
  randomRotation?: RandomRotation;
  now: number;
}

/** 一時停止 */
interface SessionPaused {
  type: "SessionPaused";
  now: number;
}

/** 再開 */
interface SessionResumed {
  type: "SessionResumed";
  now: number;
}

/** リセット（集約は rotation/interval から再構成するため追加情報を持たない） */
interface SessionReset {
  type: "SessionReset";
  /**
   * ランダム交代のモードでリセットしたときの袋（#660）。輪の順のモードでは載せない。
   * 載っていなければ、evolve は今の引く順のまま、先頭の運転者から周を始め直す。
   */
  randomRotation?: RandomRotation;
  now: number;
}

/**
 * 現ドライバーのまま持ち時間だけを満タンからやり直す（再スタート・Issue #14）。
 * SessionReset（先頭・全カウント初期化）や DriverSwitched（人が変わる・回数加算）とは異なり、
 * currentIndex / driverCounts / totalSwitches を変えず clock のみ満タン再アンカーする。
 */
interface DriverTimerReset {
  type: "DriverTimerReset";
  now: number;
}

/** フェーズ遷移 */
interface PhaseSet {
  type: "PhaseSet";
  phase: RoomPhase;
  now: number;
}

/** 設定変更（検証済みの部分設定のみを運ぶ。未指定フィールドは現状維持） */
interface ConfigSet {
  type: "ConfigSet";
  /** 名簿はここを通らない（#95 S4a・D15）。`members` は wire の境界で落ちる。 */
  config: Partial<TimerConfig>;
  /**
   * 交代先の決め方が変わったときの袋（#660）。ランダム交代を入れたら袋、輪の順へ戻したら null。
   * 変わらなければ載せない（集約の袋はそのまま）。
   */
  randomRotation?: RandomRotation | null;
  now: number;
}

/** メンバー追加（ローテーションは参加者IDで持つ・D6b） */
interface MemberAdded {
  type: "MemberAdded";
  participantId: string;
  now: number;
}

/** メンバー削除 */
interface MemberRemoved {
  type: "MemberRemoved";
  index: number;
  /**
   * 外したのが運転中の人のとき、次に担当になる席（**外した後の添字**。#376）。
   * 出す側（decide・participant.remove）が交代と同じ資格の規則で選ぶ（`nextDriverAfterRemoval`）。
   * 運転中でない人を外すときは使わない。範囲外なら evolve は位置で次の席にする。
   */
  nextDriverIndex: number;
  /**
   * ランダム交代のセッション中に運転中の人を外したときの袋（#660）。袋から引いた人、または
   * （ほかの全員が不適格で）位置で繰り上げた人を、この周で運転した人に足したもの。
   * 運転中でない人を外すとき・開始前（ロビー）・輪の順のモードでは載せない。
   */
  randomRotation?: RandomRotation;
  now: number;
}

/** メンバー並べ替え */
interface MemberMoved {
  type: "MemberMoved";
  fromIndex: number;
  toIndex: number;
  now: number;
}

/** メンバー順のシャッフル（サーバー権威で生成した順列を運ぶ） */
interface MembersShuffled {
  type: "MembersShuffled";
  /** order[i] = 新しい i 番目に来る旧 rotation インデックス（順列）。 */
  order: number[];
  now: number;
}

/** 引き継ぎメモ更新 */
interface HandoffNoteSet {
  type: "HandoffNoteSet";
  text: string;
  now: number;
}

/** 休憩開始 */
interface BreakStarted {
  type: "BreakStarted";
  now: number;
}

/** 休憩終了 */
interface BreakEnded {
  type: "BreakEnded";
  now: number;
}

/** 休憩の知らせ（#402。「知らせるだけ」の入り方で、条件に達した交代のあとに当てる） */
interface BreakSuggested {
  type: "BreakSuggested";
  now: number;
}

/** 完成 */
interface SessionCompleted {
  type: "SessionCompleted";
  now: number;
  /**
   * 完了した時点のお題のタイトル（お題なしなら null・#91）。
   * アプリ層が値として渡す。timer-core は topic-core を知らない（spec T1・T9）。
   */
  topicTitle: string | null;
}

/**
 * 中断（途中でやめる）
 * 記録を生成しない。締めくくり画面の表示のみを目的とする。
 */
interface SessionAborted {
  type: "SessionAborted";
  now: number;
}

/** 代理参加者追加（Web 非接続の人をプレースホルダーとして追加） */
interface ProxyMemberAdded {
  type: "ProxyMemberAdded";
  participantId: string;
  displayName: string;
  now: number;
}

/** 表示名変更 */
interface ParticipantRenamed {
  type: "ParticipantRenamed";
  participantId: string;
  displayName: string;
  now: number;
}

/** ドライバー対象から一時離脱 */
interface DriverSkipped {
  type: "DriverSkipped";
  participantId: string;
  now: number;
}

/** ドライバー対象に復帰 */
interface DriverResumed {
  type: "DriverResumed";
  participantId: string;
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
  | HandoffNoteSet
  | BreakStarted
  | BreakEnded
  | BreakSuggested
  | SessionCompleted
  | SessionAborted
  | ProxyMemberAdded
  | ParticipantRenamed
  | DriverSkipped
  | DriverResumed;
