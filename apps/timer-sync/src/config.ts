/**
 * sync サーバーの環境変数を集約・検証する。
 * 本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら fail-closed で起動を拒否する
 * （CSWSH 防止。Origin 検証がサイレントに全許可へ緩むのを防ぐ）。
 */
import { isLoopbackHost, isProductionEnv } from "@tasuki/rate-limit";
import { findAiUnlockKeyViolation } from "./ai-unlock-key-policy.js";

export interface SyncConfig {
  port: number;
  host: string;
  /**
   * 本番かどうか。true のとき、クライアント IP を特定できない接続を拒否する
   * （#103 設計正本 D6。ADR 0012 D6 は「クライアント保存（考え方のみ）」で本項とは無関係。
   * 混同しないよう明示する）。
   */
  requireClientAddress: boolean;
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

/**
 * ループバック判定・NODE_ENV 正規化は `apps/poker-sync/src/config.ts` と
 * 同じ 6 定義＋`isProductionEnv` を複製していた（#103 Task 7 レビュー S-1）。
 * `packages/rate-limit` の `server-env.ts` へ 1 本化し、ここでは再輸出だけを行う。
 *
 * `isLoopbackHost` は `./listening-log.ts` が直接 import しているため、
 * ここでの再輸出を欠くとそちらが壊れる。
 */
export { isLoopbackHost } from "@tasuki/rate-limit";

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

  const isProduction = isProductionEnv(env);

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error(
      "本番（NODE_ENV=production）では ALLOWED_ORIGINS の設定が必須です。" +
        "全 Origin 許可（CSWSH リスク）を防ぐため起動を中止します。",
    );
  }

  // trim は検査だけでなく実際の bind にも効かせる（末尾空白つきの値で listen しない）。
  const host = (env["HOST"] ?? "").trim() || "127.0.0.1";

  if (isProduction && !isLoopbackHost(host)) {
    throw new Error(
      `本番（NODE_ENV=production）では HOST をループバックに限定します（受け取った値: ${host}）。` +
        "Caddy を迂回した直接接続は X-Forwarded-For を偽装できるため、" +
        "レート制限が無効化されます。起動を中止します。" +
        "対処: env の HOST を 127.0.0.1（または localhost / ::1）にするか、行ごと削除してください" +
        "（未設定なら既定の 127.0.0.1 が使われます）。",
    );
  }

  // create-sync-server.ts の aiReady と同じ判定を先に確定させる（両方揃って初めて AI が有効）。
  const claudeOauthToken = (env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "").trim() || undefined;

  // AI 解錠キーの長さの範囲（下限と、プロトコルの上限）（#145・ADR 0011 決定5）。
  // AI が有効になる構成（claudeOauthToken と aiUnlockKey が両方設定されている）のときだけ検査する。
  // トークン側を消して AI を丸ごと止めた構成に残った旧鍵は不活性であり、
  // 実際には一切使われない（create-sync-server.ts の aiReady が false のまま）。
  // 不活性な鍵のためにサービスを止めない（#237 レビュー指摘2。deploy/README.md は
  // 「AI 機能を丸ごと止めたいときは token か 鍵の どちらかを消す」と案内しており、
  // token 側だけを消して止めた本番が、次のデプロイで不要に起動失敗するのを防ぐ）。
  // 判定は trim 後の値に対して行う（保持する値とずらさない）。
  const aiUnlockKey = (env["AI_UNLOCK_KEY"] ?? "").trim() || undefined;
  if (isProduction && claudeOauthToken !== undefined && aiUnlockKey !== undefined) {
    const violation = findAiUnlockKeyViolation(aiUnlockKey);
    if (violation !== null) {
      // 前置きは違反の種類（文字種・下限・上限のいずれ）に依存しない書き方にする。
      // 「下限を満たす必要があります」のような下限固定の前置きだと、上限違反時に
      // 「…: 64 文字以下にしてください」と続き自己矛盾になる（#237 最終レビュー再指摘1）。
      throw new Error(
        `本番（NODE_ENV=production）では AI_UNLOCK_KEY が規範を満たしていません: ${violation}。` +
          "この規範は、総当たりへの耐性とプロトコルの上限内で解錠が成立することの両方を守るために" +
          "起動時に強制します（ADR 0011 決定5）。起動を中止します。" +
          "対処: `openssl rand -hex 20` で生成し直し、env を差し替えてから再起動してください。" +
          "受け取った値は分類「秘密」のため、この文言には含めません。",
      );
    }
  }

  return {
    // PORT=0 は「OS に空きポートを選ばせる」を意味する有効値なので 0 を通す
    // （poker-sync の config.ts と同じ扱い）。intEnv だと 0 が不正扱いで既定 8787 に
    // 落ちるため、実 WebSocket 越しのテストが固定ポートを手で割り当てるしかなくなり、
    // 並行実行やポート衝突の帳簿を人が保守する羽目になる。
    // 実際に listen したポートは `WsAdapter.port` から取る。
    port: nonNegIntEnv(env["PORT"], 8787),
    host,
    allowedOrigins,
    maxConnections: intEnv(env["MAX_CONNECTIONS"], 200),
    maxRooms: intEnv(env["MAX_ROOMS"], 50),
    roomIdleTtlMs: intEnv(env["ROOM_IDLE_TTL_MS"], 1_800_000),
    adminToken: (env["ADMIN_TOKEN"] ?? "").trim() || undefined,
    aiUnlockKey,
    claudeOauthToken,
    aiProblemModel: (env["AI_PROBLEM_MODEL"] ?? "").trim() || DEFAULT_AI_PROBLEM_MODEL,
    aiGenerationTimeoutMs: intEnv(env["AI_GENERATION_TIMEOUT_MS"], 60_000),
    // 0 を許容（=その日の AI 生成を全面停止）。負数・非数値は既定 100。
    aiDailyLimit: nonNegIntEnv(env["AI_DAILY_LIMIT"], 100),
    heartbeatIntervalMs: intEnv(env["HEARTBEAT_INTERVAL_MS"], 15_000),
    heartbeatMaxMisses: intEnv(env["HEARTBEAT_MAX_MISSES"], 2),
    requireClientAddress: isProduction,
  };
}
