/**
 * sync サーバーの環境変数を集約・検証する。
 * 本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら fail-closed で起動を拒否する
 * （CSWSH 防止。Origin 検証がサイレントに全許可へ緩むのを防ぐ）。
 */

export interface SyncConfig {
  port: number;
  host: string;
  /**
   * 本番かどうか。true のとき、クライアント IP を特定できない接続を拒否する
   * （#103・ADR 0012 D6）。
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
 * ループバックとみなすホスト名の許可リスト。
 *
 * **禁止リストではなく許可リストにする。** 「外部に開いた値」を列挙する方式は、
 * 書き漏らした表記がそのまま防御の穴になる。
 */
const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]"]);

/**
 * `127.0.0.0/8` の点付き 10 進。**各オクテットを 0〜255 に限る。**
 * `\d+` で済ませると `127.999.999.999` のような IP ですらない値まで
 * ループバック扱いで通ってしまい、「許可リストは正確な値だけを通す」という
 * 上の方針と矛盾する。先行ゼロ（`127.01.0.1`）も曖昧なので通さない。
 */
const IPV4_LOOPBACK = /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * `HOST=localhost` はこの許可リストを通すが、**Bun の実 bind では `::1` にしか
 * bind しない**（IPv4 の `127.0.0.1` へは listen しない。再レビューが実 bind で確認）。
 * Caddy 側が `127.0.0.1:PORT` を直接叩く構成だと、この組み合わせはサービス全断になる。
 *
 * **裁定（controller）: `localhost` は許可リストから落とさない。** `localhost` は
 * 実際にループバックであり、bind 先の不一致は「接続を丸ごと拒否する」という
 * 大きな音で失敗するため、静かな事故（レート制限だけが無効化される、等）には
 * ならない。表記ゆれを避けたい運用は env の `HOST` に `127.0.0.1` を明示すればよい。
 */
export function isLoopbackHost(host: string): boolean {
  // **比較の前に正規化する。** env の値には末尾改行・前後空白が混ざりやすく、
  // ホスト名は DNS 上そもそも大文字小文字を区別しない。正規化しないと
  // `HOST=127.0.0.1 `（末尾空白）や `HOST=Localhost` が「ループバック外」と
  // 誤判定され、**正当な設定で本番が起動しなくなる**（可用性の事故）。
  // 同じファイルの adminToken などが .trim() しているのと揃える。
  const normalized = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || IPV4_LOOPBACK.test(normalized);
}

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

/**
 * `NODE_ENV` として許容する既知の値（Q-1・修正ラウンド 2）。
 * リポジトリ内で実際に使われている値は `production` と `development` だけだが、
 * `bun test` 等が `NODE_ENV=test` を設定する経路があるため `test` も既知に含める
 * （controller が grep で確認済み）。
 */
const KNOWN_NODE_ENVS: readonly string[] = ["production", "development", "test"];

/**
 * `NODE_ENV` の生の値を正規化する。**正規化を列挙で追い続けないための下ごしらえ**
 * （沈黙そのものを塞ぐのは `resolveNodeEnv` の未知値 throw）。
 *
 * 1. Unicode のフォーマット文字（`\p{Cf}`: ゼロ幅スペース・BOM 等）を除去する。
 *    これらは `String#trim()` では落ちない（BOM は例外的に trim が落とすが、
 *    ゼロ幅スペースは落ちない）。
 * 2. 前後を囲む対の引用符（`"..."` / `'...'`）を 1 組だけ剥がす
 *    （env への手入力・コピペで `NODE_ENV="production"` のように紛れ込む）。
 * 3. 前後の空白を trim し、小文字化する。
 */
function normalizeNodeEnv(raw: string): string {
  const withoutFormatChars = raw.replace(/\p{Cf}/gu, "");
  const trimmedOnce = withoutFormatChars.trim();
  const isQuoted =
    trimmedOnce.length >= 2 &&
    ((trimmedOnce.startsWith('"') && trimmedOnce.endsWith('"')) ||
      (trimmedOnce.startsWith("'") && trimmedOnce.endsWith("'")));
  const unquoted = isQuoted ? trimmedOnce.slice(1, -1) : trimmedOnce;
  return unquoted.trim().toLowerCase();
}

/**
 * `NODE_ENV` を正規化したうえで、既知の値かどうかを検査する（P-1: 唯一の判定箇所）。
 *
 * 表記ゆれ（前後の空白・改行・大文字小文字・ゼロ幅スペース・BOM・引用符つき）を
 * 正規化で吸収したうえで、**正規化後になお空でなく既知の値でもない場合は起動時に
 * throw する。** 「賢い検査ほど穴が増える。手書きの字句解析は 3 回続けて新しい
 * 検出漏れを作った」という教訓により、表記ゆれの列挙を増やし続ける代わりに、
 * 未知の値そのものを無言で通さないことで沈黙を不可能にする。
 *
 * 空文字（未設定）は許可する（本番以外の既定挙動を壊さないため）。
 */
function resolveNodeEnv(env: Record<string, string | undefined>): string {
  const raw = env["NODE_ENV"] ?? "";
  const normalized = normalizeNodeEnv(raw);
  if (normalized !== "" && !KNOWN_NODE_ENVS.includes(normalized)) {
    throw new Error(
      `NODE_ENV の値が未知です（受け取った値: ${JSON.stringify(raw)}）。` +
        `既知の値は ${KNOWN_NODE_ENVS.join(" / ")} のいずれかです。` +
        "表記ゆれ・誤設定によって本番の防御（requireClientAddress・HOST 検査・" +
        "ALLOWED_ORIGINS 検査）が無言ですり抜けるのを防ぐため起動を中止します。",
    );
  }
  return normalized;
}

/**
 * `NODE_ENV` が本番を意味するかどうかを判定する。
 * このため `loadSyncConfig` 内の本番判定は必ずこの関数を経由させ、
 * `env["NODE_ENV"] === "production"` を直接書かない。
 */
function isProductionEnv(env: Record<string, string | undefined>): boolean {
  return resolveNodeEnv(env) === "production";
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
    aiUnlockKey: (env["AI_UNLOCK_KEY"] ?? "").trim() || undefined,
    claudeOauthToken: (env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "").trim() || undefined,
    aiProblemModel: (env["AI_PROBLEM_MODEL"] ?? "").trim() || DEFAULT_AI_PROBLEM_MODEL,
    aiGenerationTimeoutMs: intEnv(env["AI_GENERATION_TIMEOUT_MS"], 60_000),
    // 0 を許容（=その日の AI 生成を全面停止）。負数・非数値は既定 100。
    aiDailyLimit: nonNegIntEnv(env["AI_DAILY_LIMIT"], 100),
    heartbeatIntervalMs: intEnv(env["HEARTBEAT_INTERVAL_MS"], 15_000),
    heartbeatMaxMisses: intEnv(env["HEARTBEAT_MAX_MISSES"], 2),
    requireClientAddress: isProduction,
  };
}
