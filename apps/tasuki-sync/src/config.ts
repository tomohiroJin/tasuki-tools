/**
 * sync サーバーの環境変数を集約・検証する。
 * 本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら fail-closed で起動を拒否する
 * （CSWSH 防止。Origin 検証がサイレントに全許可へ緩むのを防ぐ）。
 *
 * **#95 S2 で timer と poker の 2 本を 1 プロセスへ統合した**（`docs/adr/0017`・
 * 設計正本 D9）。旧 `apps/poker-sync/src/config.ts` はここへ畳み込んである。
 * 統合で「1 つになるもの」と「文脈ごとに残るもの」が分かれるため、
 * {@link SyncConfig} の各キーがどちらなのかを型の docstring に明記してある。
 */
import { isLoopbackHost, isProductionEnv } from "@tasuki/rate-limit";

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
  /**
   * 同時接続数の上限。超過分は 1013 で拒否する。
   *
   * **プロセス全体で 1 つ**である（接続レジストリが 1 つだから。#95 S2・D22）。
   * 統合前は timer と poker がそれぞれ 200 を持ち、実効枠は合計 400 だった。
   * 既定値を 400 にしてあるのは、その実効枠を統合の前後で変えないためである。
   */
  maxConnections: number;
  /**
   * 保持するルーム数の上限。超過時は新規作成を拒否する。
   *
   * **プロセス全体で 1 つ**である（#95 S4a で名簿が 1 つの保管になった）。
   * timer の入口も poker の入口も、同じ名簿の件数を見て新規作成を拒む。
   *
   * 既定 100 の根拠は**統合前の実効枠を保つこと**である。統合前は 2 プロセスが
   * それぞれ 50 を持っていて実効枠は 50 × 2 = 100 だった。S2 で 1 プロセスに
   * なった後も、名簿が文脈ごとに 2 つあるあいだは 50 ずつで 100 のままだった。
   * S4a で名簿が 1 つになり 1 本で数えるようになったので、100 にしないと半減する。
   * （`maxConnections` が S2 で 200 → 400 になったのとまったく同型の調整である。）
   *
   * ⚠ **同時に占有される数は増える。** S4a で poker のルームが「最後の接続が切れたら
   * 即時破棄」から `ROOM_IDLE_TTL_MS`（既定 30 分）保持へ変わったためである。
   * **TTL は変えない** —— 縮めると timer の復帰体験（席を外して戻る）まで巻き添えになる。
   *
   * ⚠ **本番の `app.env` は `deploy/setup.sh` が上書きしない。** `env.example` を
   * 直しただけでは届かないので、切り替え手順（`deploy/timer/NOTES.md`）に従って
   * 手で書き換えること。確認は起動ログの `maxRooms` で行う。
   */
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
  /**
   * 1 メッセージの最大バイト数。超過はエラー応答（接続は保つ）。
   *
   * 旧 `apps/poker-sync/src/config.ts` から持ち込んだ（#95 S2）。統合前の timer 側は
   * `ws-adapter.ts` に 64KB を直書きしており、env から絞れなかった。**既定値は
   * 両者とも 64KB で同じ**なので、既定のままなら振る舞いは変わらない。
   */
  maxMessageBytes: number;
  /**
   * WebSocket フレームの最大バイト数（`Bun.serve` の `maxPayloadLength`）。
   * これを超えるフレームはプロトコル層で切られ、エラー応答を返す余地が無い。
   * そのため `maxMessageBytes` より大きく取り、超過を自前で検出できる帯域を残す。
   *
   * **統合で timer 側の実効値が下がる**（Bun 既定の 16MB → 既定 128KB）。
   * timer の旧実装は `maxPayloadLength` を指定せず Bun の既定に委ねており、
   * 64KB〜16MB のフレームには MESSAGE_TOO_LARGE を返して接続を保っていた。
   * 統合後、その帯域のうち 128KB より上は 1006 の切断になる。アプリの上限
   * （`maxMessageBytes` = 64KB）の遥か上で正当なコマンドは入らないため受け入れる。
   * poker 側が同じ判断を先に下している（旧 poker-sync の同名フィールドの docstring）。
   */
  maxFrameBytes: number;
}

/**
 * メッセージ上限の天井。これが無いと、そこから導出するフレーム上限も青天井になり、
 * 1 フレームあたりの確保量を運用者が誤って無制限にできてしまう。
 * 正当なメッセージ（表示名 24 文字・ルームコード・カードの列挙・タイマーのコマンド）は
 * 既定の 64KB すら大きく下回るため、1MB あれば将来の追加にも十分な余裕がある。
 */
const MAX_MESSAGE_BYTES_CEILING = 1024 * 1024;

/**
 * フレーム上限をメッセージ上限の何倍に取るか。
 * 同じ値にすると超過フレームがプロトコル層で切られ、`MESSAGE_TOO_LARGE` を返して
 * 接続を保つ振る舞いが成立しない。倍率ぶんが「検出して返答できる」帯域になる。
 */
const FRAME_BYTES_MULTIPLIER = 2;

/** `AI_PROBLEM_MODEL` 未設定時の既定モデル。起動ログが「既定どおりか」を示す際にも使う。 */
export const DEFAULT_AI_PROBLEM_MODEL = "sonnet";

/**
 * ループバック判定・NODE_ENV 正規化は、かつて timer と poker の 2 つの config が
 * 同じ 6 定義＋`isProductionEnv` を複製していた（#103 Task 7 レビュー S-1）。
 * `packages/rate-limit` の `server-env.ts` へ 1 本化し、ここでは再輸出だけを行う。
 * **#95 S2 の統合で複製元そのものが消えた**が、1 本化の判断はそのまま効いている。
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

  const maxMessageBytes = Math.min(
    intEnv(env["MAX_MESSAGE_BYTES"], 64 * 1024),
    MAX_MESSAGE_BYTES_CEILING,
  );

  return {
    // PORT=0 は「OS に空きポートを選ばせる」を意味する有効値なので 0 を通す。
    // intEnv だと 0 が不正扱いで既定 8787 に落ちるため、実 WebSocket 越しのテストが
    // 固定ポートを手で割り当てるしかなくなり、並行実行やポート衝突の帳簿を人が
    // 保守する羽目になる。実際に listen したポートは `WsAdapter.port` から取る。
    port: nonNegIntEnv(env["PORT"], 8787),
    host,
    allowedOrigins,
    // 既定 400 の根拠は SyncConfig.maxConnections の docstring（統合前の実効枠を保つ）。
    maxConnections: intEnv(env["MAX_CONNECTIONS"], 400),
    // 既定 100 の根拠は SyncConfig.maxRooms の docstring（統合前の実効枠を保つ）。
    maxRooms: intEnv(env["MAX_ROOMS"], 100),
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
    maxMessageBytes,
    maxFrameBytes: maxMessageBytes * FRAME_BYTES_MULTIPLIER,
    requireClientAddress: isProduction,
  };
}
