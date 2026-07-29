/**
 * ドメインの集約型と導出関数
 * FR-006, FR-007, FR-008
 */

// T057: 自ファイル内でのみ使う公開記号のため export を外した（FR-119③・SC-039）。
// 型そのものは他ファイルからも使う（Participant.participantId 等）が、
// 型エイリアスとして名指しで import している箇所がなく、実体は string のため
// 呼び出し側は string で十分だった（構造的部分型）。
type ConnId = string;
type ParticipantId = string;
type RoomCode = string;

/** セッション状態（時間系を含まない） */
interface SessionState {
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
  /** お題機能を使うか（false なら言語/お題を要求せず開始できる）。既定 true 相当。 */
  problemEnabled?: boolean;
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
  /** パスフレーズ保護中か（平文は載せない・サーバ側 Map で保持・R4-2）。 */
  passphraseProtected?: boolean;
  /** AI お題生成の解錠状態（合言葉照合済み・平文はサーバ専用 = snapshot 非混入）。 */
  aiUnlocked?: boolean;
  /** 初めてセッションが開始された時刻（epoch ms）。一度設定したら消さない。
   *  権限判定を「一度でも開始したか」で行うための単調フラグ（D2）。
   *  phase の後戻り（"setup" 等）では消えない点が重要。 */
  startedAt?: number | null;
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
  /** ドライバー別の担当回数（members と同順・§振り返り）。旧記録には無いので任意。 */
  driverCounts?: number[];
  /** ローテーションが一巡した回数（totalSwitches / rotation 長）。任意。 */
  rounds?: number;
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

/**
 * 初期集約を生成する。
 *
 * rotation は**参加者IDの配列**なので、表示名の一覧である `config.members` からは組み立てられない。
 * 呼び出し側が「誰がローテーションに並ぶか」を識別子で渡す（D6b）。
 */
export function initialAggregate(config: SessionConfig, rotation: readonly string[]): Aggregate {
  return {
    session: {
      rotation: [...rotation],
      currentIndex: 0,
      isPaused: false,
      driverCounts: rotation.map(() => 0),
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

/** ホストを newHostParticipantId へ移譲する純粋変換（R2-3/R2-4）。
 *  対象を host、現 host を editor に付け替え、hostParticipantId を更新する。
 *  対象の存在・オンライン等の検証は呼び出し側（handler）が行う。 */
export function transferHost(room: Room, newHostParticipantId: string): Room {
  return {
    ...room,
    hostParticipantId: newHostParticipantId,
    participants: room.participants.map((p) =>
      p.participantId === newHostParticipantId
        ? { ...p, role: "host" }
        : p.participantId === room.hostParticipantId
          ? { ...p, role: "editor" }
          : p,
    ),
  };
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

/** ユーザ入力文字列の最大長（S・A04 安全でない設計）。巨大文字列の保存/ブロードキャスト/
 *  描画による DoS を防ぐため、信頼境界（Valibot コマンドスキーマ）で一律に上限を課す。
 *  UI 側の入力欄 maxLength とも揃えて二重防御にする。 */
export const MAX_DISPLAY_NAME = 40;
/**
 * NFKC 正規化が1文字を最大何文字へ展開しうるか（実測 18: U+FDFA `ﷺ`）。
 *
 * 正規化前の緩い上限を `MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION` に置き、正規化後に
 * `MAX_DISPLAY_NAME` を厳密に課す（schemas.ts）。前段だけだと展開で上限を突破される。
 */
export const MAX_NFKC_EXPANSION = 18;
export const MAX_ROOM_NAME = 60;
export const MAX_HANDOFF_NOTE = 2000;
export const MAX_PROBLEM_TITLE = 200;
export const MAX_PROBLEM_TEXT = 4000; // description / exampleTest
export const MAX_PROBLEM_HINT = 500; // ヒント 1 件あたり
export const MAX_PROBLEM_HINTS = 20; // ヒント配列の件数
/** セッション設定の言語・難易度の最大長。AI お題生成では buildProblemPrompt 経由で
 *  claude -p のプロンプトへ生で渡るため、境界で上限を課しプロンプト膨張による
 *  クレジット浪費・注入の余地を抑える（UI は固定ドロップダウンだが境界は緩いと無防備）。 */
export const MAX_CONFIG_LANGUAGE = 40;
export const MAX_CONFIG_DIFFICULTY = 20;

/** ルームパスフレーズの最大長（巨大入力 DoS 対策・R4-2）。 */
export const MAX_PASSPHRASE = 128;
/** AI 解錠合言葉の最大長（巨大入力 DoS 対策）。 */
export const MAX_AI_UNLOCK_KEY = 64;
