/**
 * sync サーバーの環境変数を集約・検証する。
 * 本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら fail-closed で起動を拒否する
 * （CSWSH 防止。Origin 検証がサイレントに全許可へ緩むのを防ぐ）。
 */

export interface SyncConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  maxConnections: number;
  maxRooms: number;
  roomIdleTtlMs: number;
  /** 管理エンドポイント（/status・/admin/rooms）の認証トークン。未設定なら管理面は無効。 */
  adminToken: string | undefined;
  /** AI お題生成の解錠合言葉。未設定なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。 */
  aiUnlockKey: string | undefined;
  /** Claude サブスクの OAuth トークン（claude setup-token）。子プロセスの env にのみ渡す。 */
  claudeOauthToken: string | undefined;
  /** claude -p --model に渡すモデル名 */
  aiProblemModel: string;
  /** AI 生成のタイムアウト（ms） */
  aiGenerationTimeoutMs: number;
  /** AI 生成の日次回数上限（グローバル・揮発カウント）。0 で当日生成を全面停止できる。 */
  aiDailyLimit: number;
  /** サーバー主導のハートビート（ws.ping）送信間隔（ms）。Issue #25: 死活監視。 */
  heartbeatIntervalMs: number;
  /** 連続でこの回数分 pong が確認できない接続を terminate する（Issue #25）。 */
  heartbeatMaxMisses: number;
}

/** `AI_PROBLEM_MODEL` 未設定時の既定モデル。起動ログが「既定どおりか」を示す際にも使う。 */
export const DEFAULT_AI_PROBLEM_MODEL = "sonnet";

/** env 値を整数として解釈し、不正なら既定値を返す。 */
function intEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** env 値を 0 以上の整数として解釈し、不正（負数・非数値）なら既定値を返す。
 *  0 を有効値として通すため、明示的な「無効化」を env から指定できる（intEnv との違い）。 */
function nonNegIntEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadSyncConfig(env: Record<string, string | undefined>): SyncConfig {
  const allowedOrigins = (env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (env["NODE_ENV"] === "production" && allowedOrigins.length === 0) {
    throw new Error(
      "本番（NODE_ENV=production）では ALLOWED_ORIGINS の設定が必須です。" +
        "全 Origin 許可（CSWSH リスク）を防ぐため起動を中止します。",
    );
  }

  return {
    // PORT=0 は「OS に空きポートを選ばせる」を意味する有効値なので 0 を通す
    // （poker-sync の config.ts と同じ扱い）。intEnv だと 0 が不正扱いで既定 8787 に
    // 落ちるため、実 WebSocket 越しのテストが固定ポートを手で割り当てるしかなくなり、
    // 並行実行やポート衝突の帳簿を人が保守する羽目になる。
    // 実際に listen したポートは `WsAdapter.port` から取る。
    port: nonNegIntEnv(env["PORT"], 8787),
    host: env["HOST"] ?? "127.0.0.1",
    allowedOrigins,
    maxConnections: intEnv(env["MAX_CONNECTIONS"], 200),
    maxRooms: intEnv(env["MAX_ROOMS"], 50),
    roomIdleTtlMs: intEnv(env["ROOM_IDLE_TTL_MS"], 1_800_000),
    adminToken: (env["ADMIN_TOKEN"] ?? "").trim() || undefined,
    aiUnlockKey: (env["AI_UNLOCK_KEY"] ?? "").trim() || undefined,
    claudeOauthToken: (env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "").trim() || undefined,
    aiProblemModel: (env["AI_PROBLEM_MODEL"] ?? "").trim() || DEFAULT_AI_PROBLEM_MODEL,
    aiGenerationTimeoutMs: intEnv(env["AI_GENERATION_TIMEOUT_MS"], 60_000),
    // 0 を許容（=その日の AI 生成を全面停止）。負数・非数値は既定 100。
    aiDailyLimit: nonNegIntEnv(env["AI_DAILY_LIMIT"], 100),
    heartbeatIntervalMs: intEnv(env["HEARTBEAT_INTERVAL_MS"], 15_000),
    heartbeatMaxMisses: intEnv(env["HEARTBEAT_MAX_MISSES"], 2),
  };
}
