/**
 * ドメインの集約型と導出関数
 * FR-006, FR-007, FR-008
 */

export type ConnId = string;
export type ParticipantId = string;
export type RoomCode = string;

/** セッション状態（時間系を含まない） */
export interface SessionState {
  /** ローテーション順の参加者IDリスト */
  rotation: string[];
  /** 現ドライバーのインデックス */
  currentIndex: number;
  /** 一時停止フラグ */
  isPaused: boolean;
  /** 各人の担当回数（rotationと同じ長さ） */
  driverCounts: number[];
  /** 総交代回数 */
  totalSwitches: number;
}

/**
 * サーバー権威タイマー状態
 * 残り時間と経過時間は anchorServerTime から導出する
 */
export interface ServerClock {
  /** タイマー稼働中フラグ */
  running: boolean;
  /** 交代間隔（秒） */
  intervalSeconds: number;
  /** 開始/再開/交代時のサーバー時刻 (epoch ms) */
  anchorServerTime: number;
  /** anchor時点の残り秒 */
  secondsLeftAtAnchor: number;
  /** 稼働区間の合計(ms)。停止時に確定加算 */
  accumulatedElapsedMs: number;
  /** 現在の稼働区間の開始時刻（停止中はnull） */
  runningSince: number | null;
}

/** 集約 */
export interface Aggregate {
  session: SessionState;
  clock: ServerClock;
}

/** セッション設定 */
export interface SessionConfig {
  /** プログラミング言語 */
  language: string;
  /** 難易度 */
  difficulty: string;
  /** メンバー名リスト（2〜10人） */
  members: string[];
  /** 交代間隔（分）: 3/5/7/10/15 のみ */
  intervalMinutes: IntervalMinutes;
  /** ナビゲーター役を明示するか */
  navigatorEnabled?: boolean;
  /** 何ローテーションごとに休憩を提案するか */
  breakEveryRotations?: number;
  /** 強い全画面交代通知を使うか */
  assertiveSwitch?: boolean;
}

/** お題の出所 */
export type ProblemSource = "ai" | "fallback" | "custom";

/** お題 */
export interface Problem {
  title: string;
  description: string;
  requirements: string[];
  exampleTest: string;
  hints: string[];
  /** 出所（v2追加・省略時は undefined = 出所不明） */
  source?: ProblemSource;
  /** 利用者が編集済みか（v2追加） */
  edited?: boolean;
}

/** 参加者 */
export interface Participant {
  participantId: ParticipantId;
  connId: ConnId | null;
  displayName: string;
  role: "host" | "editor" | "viewer";
  presence: "online" | "idle" | "offline";
  hasAiKey: boolean;
  joinedAt: number;
  /** Web 非接続の代理参加者か（v2追加。既定 false 相当） */
  isPlaceholder?: boolean;
  /** ドライバーローテーション対象か（v2追加。既定 true 相当） */
  driverEligible?: boolean;
}

/** 出題モード（v2追加） */
export type ProblemMode = "ai" | "fallback";

/** ルームフェーズ */
export type RoomPhase = "setup" | "ready" | "session" | "celebration";

/** ルーム全体 */
export interface Room {
  code: RoomCode;
  createdAt: number;
  hostParticipantId: ParticipantId;
  config: SessionConfig;
  problem: Problem | null;
  session: SessionState;
  clock: ServerClock;
  phase: RoomPhase;
  participants: Participant[];
  sessionRecords: CompletionRecord[];
  handoffNote: string;
  onBreak: boolean;
  /** 出題モード（v2追加。既定 "fallback"） */
  problemMode?: ProblemMode;
}

/** 完成記録 */
export interface CompletionRecord {
  id: string;
  roomId?: string;
  problemTitle: string;
  language: string;
  difficulty: string;
  elapsedSeconds: number;
  members: string[];
  totalSwitches: number;
  completedAt: number;
}

// ─── 導出関数 ───────────────────────────────────────────────────────────────

/**
 * 現在の残り秒を導出する
 * @param clock タイマー状態
 * @param now 現在時刻 (epoch ms)
 * @param clockOffset クライアント→サーバーの時刻補正量(ms)
 */
export function secondsLeft(
  clock: ServerClock,
  now: number,
  clockOffset = 0,
): number {
  if (!clock.running) {
    return clock.secondsLeftAtAnchor;
  }
  const adjustedNow = now + clockOffset;
  const elapsed = (adjustedNow - clock.anchorServerTime) / 1000;
  return Math.max(0, clock.secondsLeftAtAnchor - elapsed);
}

/**
 * 稼働経過時間(ms)を導出する（停止中の時間を除外）
 * FR-006
 * @param clock タイマー状態
 * @param now 現在時刻 (epoch ms)
 * @param clockOffset クライアント→サーバーの時刻補正量(ms)
 */
export function elapsedMs(
  clock: ServerClock,
  now: number,
  clockOffset = 0,
): number {
  if (!clock.running || clock.runningSince === null) {
    return clock.accumulatedElapsedMs;
  }
  const adjustedNow = now + clockOffset;
  return clock.accumulatedElapsedMs + (adjustedNow - clock.runningSince);
}

/** 初期集約を生成する */
export function initialAggregate(config: SessionConfig): Aggregate {
  return {
    session: {
      rotation: [...config.members],
      currentIndex: 0,
      isPaused: false,
      driverCounts: config.members.map(() => 0),
      totalSwitches: 0,
    },
    clock: {
      running: false,
      intervalSeconds: config.intervalMinutes * 60,
      anchorServerTime: 0,
      secondsLeftAtAnchor: config.intervalMinutes * 60,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
  };
}

/**
 * ドライバー対象（driverEligible !== false）の次のインデックスを返す。
 * @param session セッション状態
 * @param currentIndex 現在のインデックス
 * @param ineligible ドライバー対象外のインデックス集合（undefined = 全員対象）
 * @returns 次の eligible インデックス。全員 ineligible の場合は currentIndex を返す。
 */
export function nextEligibleIndex(
  session: Pick<SessionState, "rotation">,
  currentIndex: number,
  ineligible: Set<number> | undefined,
): number {
  const len = session.rotation.length;
  if (len === 0) return 0;
  if (!ineligible || ineligible.size === 0) {
    return (currentIndex + 1) % len;
  }

  // 最大 len 回試行して eligible を見つける
  for (let i = 1; i <= len; i++) {
    const candidate = (currentIndex + i) % len;
    if (!ineligible.has(candidate)) return candidate;
  }
  // 全員 ineligible → 現状維持
  return currentIndex;
}

/** 交代間隔として許容される分の一覧 */
export const VALID_INTERVAL_MINUTES = [3, 5, 7, 10, 15] as const;

/** 交代間隔の型 */
export type IntervalMinutes = (typeof VALID_INTERVAL_MINUTES)[number];

/** メンバー人数の制約 */
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 10;

/** お題の要件（requirements）配列の最大件数。巨大入力を拒否するための上限。
 *  decide（ドメイン検証）と schemas（Valibot 境界検証）の両方から参照し、値を一元化する。 */
export const MAX_PROBLEM_REQUIREMENTS = 20;
