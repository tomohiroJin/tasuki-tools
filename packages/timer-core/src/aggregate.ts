/**
 * ドメインの集約型と導出関数
 * FR-006, FR-007, FR-008
 */

/**
 * ローテーションの 1 席（#95 S4a・D6）。
 *
 * **代理は名簿の住人ではなく、輪の上のラベルである。** 名簿（`@tasuki/room-core`）に
 * 居るのは実際に名乗って入室した人だけで、対面で同席しているだけの人（代理）は
 * ここにしか存在しない。だからこの型は「名簿の参加者を指す席」と「ラベルだけの席」の
 * 2 つを持つ判別可能 union になっている。
 *
 * `eligible` はドライバーとして順番が回ってくるかどうか（一時離脱で false になる）。
 * かつては `Participant.driverEligible` が持っていたが、それは名簿の属性ではなく
 * 「輪の上の席の属性」なので、名簿から抜くときにここへ移した。
 */
export type RotationEntry =
  | { kind: "member"; participantId: string; eligible: boolean }
  | { kind: "proxy"; id: string; label: string; eligible: boolean };

/** ローテーションの席の識別子。member は参加者ID、proxy は自分の ID。 */
export function rotationEntryId(entry: RotationEntry): string {
  return entry.kind === "member" ? entry.participantId : entry.id;
}

/** セッション状態（時間系を含まない） */
interface SessionState {
  /** ローテーション順の席（#95 S4a・D6） */
  rotation: RotationEntry[];
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

/**
 * timer の設定（**サーバー側**・#95 S4a・D15）。
 *
 * **名簿を持たない。** かつてここには `members: string[]`（表示名の一覧）があったが、
 * それは名簿（`@tasuki/room-core`）と `session.rotation` の二重帳簿だった。表示名の
 * 解決はアプリ層の DTO 組み立て（`timer-snapshot-dto.ts`）が毎回行う。
 *
 * wire へ出る形は {@link ./wire.js SessionConfig}（`members` を持つ）である。
 */
export interface TimerConfig {
  /** プログラミング言語 */
  language: string;
  /** 難易度 */
  difficulty: string;
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
  source?: ProblemSource | undefined;
  /** 利用者が編集済みか（v2追加） */
  edited?: boolean | undefined;
}

/** 出題モード（v2追加） */
export type ProblemMode = "ai" | "fallback";

/** ルームフェーズ */
export type RoomPhase = "setup" | "ready" | "session" | "celebration";

/**
 * サーバー側の timer の状態（#95 S4a・D2）。
 *
 * **名簿を持たない。** 誰が居るかはメンバーシップ文脈（`@tasuki/room-core` の `Room`）が
 * 正本で、`code` で突き合わせる。この 2 つが出会うのはアプリ層の DTO 組み立て
 * （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts`）だけである。
 *
 * クライアントへ送る形は {@link ./wire.js Room} で、これはその投影ではなく合成結果である。
 */
export interface TimerState {
  code: string;
  createdAt: number;
  config: TimerConfig;
  problem: Problem | null;
  session: SessionState;
  clock: ServerClock;
  phase: RoomPhase;
  sessionRecords: CompletionRecord[];
  handoffNote: string;
  onBreak: boolean;
  /** 出題モード（v2追加。既定 "fallback"） */
  problemMode?: ProblemMode;
  /** パスフレーズ保護中か（平文は載せない・サーバ側 Map で保持・R4-2）。 */
  passphraseProtected?: boolean;
  /** AI お題生成の解錠状態（合言葉照合済み・平文はサーバ専用 = snapshot 非混入）。 */
  aiUnlocked?: boolean;
  /**
   * AI お題生成の鍵を持つ参加者の ID。wire の `Participant.hasAiKey` の出所（#95 S4a）。
   *
   * 鍵の有無は「その人が誰か」ではなく「その人が timer で何をできるか」なので、
   * 名簿ではなくここが持つ（`@tasuki/room-core` はツールを知らない）。
   */
  aiKeyHolders: string[];
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
 * rotation は**席の配列**（{@link RotationEntry}）なので、設定からは組み立てられない。
 * 呼び出し側が「誰が輪に並ぶか」を席として渡す（D6b・#95 S4a）。
 */
export function initialAggregate(config: TimerConfig, rotation: readonly RotationEntry[]): Aggregate {
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
  ineligible: ReadonlySet<number> | undefined,
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

/** ローテーションに並べられる席数の上限。
 *  下限（かつての `MIN_MEMBERS`）は、それを見ていた `config.set` の members 検証が
 *  #95 S4a で概念ごと消えたため落とした（`decide.ts` の削除箇所を参照）。 */
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
