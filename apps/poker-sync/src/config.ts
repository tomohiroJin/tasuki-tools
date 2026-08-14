/**
 * sync サーバーの環境変数を集約・検証する（Issue #63）。
 *
 * 値をここ 1 箇所に集めるのは、防御の設定が実装のあちこちに散って
 * サイレントに緩むのを防ぐため。本番（NODE_ENV=production）で ALLOWED_ORIGINS が
 * 空なら fail-closed で起動を拒否する（CSWSH 防止）。
 */
import { isLoopbackHost, isProductionEnv } from '@tasuki/rate-limit';

export interface PokerSyncConfig {
  port: number;
  /** 待ち受けアドレス。既定は 127.0.0.1（Caddy 経由のみを想定し、直接到達を塞ぐ）。 */
  host: string;
  /**
   * 本番かどうか。true のとき、クライアント IP を特定できない接続を拒否する
   * （#103・ADR 0012 D6）。
   */
  requireClientAddress: boolean;
  allowedOrigins: string[];
  /** 同時接続数の上限。超過分は 1013 で拒否する。 */
  maxConnections: number;
  /** 保持するルーム数の上限。超過時は新規作成を拒否する。 */
  maxRooms: number;
  /** 1 メッセージの最大バイト数。超過はエラー応答（接続は保つ）。 */
  maxMessageBytes: number;
  /**
   * WebSocket フレームの最大バイト数（`Bun.serve` の `maxPayloadLength`）。
   * これを超えるフレームはプロトコル層で切られ、エラー応答を返す余地が無い。
   * そのため `maxMessageBytes` より大きく取り、超過を自前で検出できる帯域を残す。
   */
  maxFrameBytes: number;
  /** サーバー主導のハートビート（ping）送信間隔（ms）。 */
  heartbeatIntervalMs: number;
  /** 連続でこの回数分 pong が確認できない接続を切断する。 */
  heartbeatMaxMisses: number;
}

/**
 * メッセージ上限の天井。これが無いと、そこから導出するフレーム上限も青天井になり、
 * 1 フレームあたりの確保量を運用者が誤って無制限にできてしまう。
 * poker の正当なメッセージ（名前 24 文字・ルーム ID 8 文字・カードの列挙）は
 * 既定の 64KB すら大きく下回るため、1MB あれば将来の追加にも十分な余裕がある。
 */
const MAX_MESSAGE_BYTES_CEILING = 1024 * 1024;

/**
 * フレーム上限をメッセージ上限の何倍に取るか。
 * 同じ値にすると超過フレームがプロトコル層で切られ、`message-too-large` を返して
 * 接続を保つ振る舞いが成立しない。倍率ぶんが「検出して返答できる」帯域になる。
 */
const FRAME_BYTES_MULTIPLIER = 2;

/**
 * ループバック判定・NODE_ENV 正規化は `apps/timer-sync/src/config.ts` と
 * 同じ 6 定義＋`isProductionEnv` を複製していた（#103 Task 7 レビュー S-1）。
 * timer-sync 側は 6 ラウンドの敵対的レビューを経て今の形になっており、
 * 表記ゆれ・IP ですらない値・NODE_ENV の未知値が無言ですり抜ける穴を
 * 1 つずつ塞いだ結果である。二重実装は `packages/rate-limit` の `server-env.ts`
 * へ 1 本化した（同期はコメント頼みで `docs/adr/0002` が禁じる二重正本だった）。
 */

/** env 値を正の整数として解釈し、不正なら既定値を返す（上限値は 0 に意味が無い）。 */
function intEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** env 値を 0 以上の整数として解釈する。0 が有効な意味を持つ設定に使う。 */
function nonNegIntEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadPokerSyncConfig(env: Record<string, string | undefined>): PokerSyncConfig {
  const allowedOrigins = (env['ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isProduction = isProductionEnv(env);

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error(
      '本番（NODE_ENV=production）では ALLOWED_ORIGINS の設定が必須です。' +
        '全 Origin 許可（CSWSH リスク）を防ぐため起動を中止します。',
    );
  }

  // trim は検査だけでなく実際の bind にも効かせる（末尾空白つきの値で listen しない）。
  const host = (env['HOST'] ?? '').trim() || '127.0.0.1';

  if (isProduction && !isLoopbackHost(host)) {
    throw new Error(
      `本番（NODE_ENV=production）では HOST をループバックに限定します（受け取った値: ${host}）。` +
        'Caddy を迂回した直接接続は X-Forwarded-For を偽装できるため、' +
        'レート制限が無効化されます。起動を中止します。' +
        '対処: env の HOST を 127.0.0.1（または localhost / ::1）にするか、行ごと削除してください' +
        '（未設定なら既定の 127.0.0.1 が使われます）。',
    );
  }

  const maxMessageBytes = Math.min(
    intEnv(env['MAX_MESSAGE_BYTES'], 64 * 1024),
    MAX_MESSAGE_BYTES_CEILING,
  );

  return {
    // PORT=0 は「任意の空きポート」を意味する有効値なので 0 を通す（テストが使う）。
    port: nonNegIntEnv(env['PORT'], 3311),
    host,
    requireClientAddress: isProduction,
    allowedOrigins,
    maxConnections: intEnv(env['MAX_CONNECTIONS'], 200),
    maxRooms: intEnv(env['MAX_ROOMS'], 50),
    maxMessageBytes,
    maxFrameBytes: maxMessageBytes * FRAME_BYTES_MULTIPLIER,
    heartbeatIntervalMs: intEnv(env['HEARTBEAT_INTERVAL_MS'], 15_000),
    // **0 を通してはいけない。** ハートビートは「欠落回数 >= 上限」で切断するため、
    // 0 だと最初の tick で ping を送る前に全接続が terminate される。
    // 猶予回数として意味を成さないので、正の整数のみ受け付ける（timer 側と同じ）。
    heartbeatMaxMisses: intEnv(env['HEARTBEAT_MAX_MISSES'], 2),
  };
}
