/**
 * sync サーバーの環境変数を集約・検証する（Issue #63）。
 *
 * 値をここ 1 箇所に集めるのは、防御の設定が実装のあちこちに散って
 * サイレントに緩むのを防ぐため。本番（NODE_ENV=production）で ALLOWED_ORIGINS が
 * 空なら fail-closed で起動を拒否する（CSWSH 防止）。
 */

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
 * ループバックとみなすホスト名の許可リスト。
 *
 * **禁止リストではなく許可リストにする。** 「外部に開いた値」を列挙する方式は、
 * 書き漏らした表記がそのまま防御の穴になる。
 *
 * ここから `resolveNodeEnv` までの一連の定義は、`apps/timer-sync/src/config.ts` の
 * 同名の定義と**意図的に重複させている**（#103 Task 7・controller 裁定）。
 * timer-sync 側は 6 ラウンドの敵対的レビューを経て今の形になっており、
 * 表記ゆれ・IP ですらない値・NODE_ENV の未知値が無言ですり抜ける穴を
 * 1 つずつ塞いだ結果である。**どちらかを直したら、必ずもう片方も確認すること。**
 * 二重実装を解消したい場合は `packages/` への切り出しを検討する。
 */
const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]']);

/**
 * `127.0.0.0/8` の点付き 10 進。**各オクテットを 0〜255 に限る。**
 * `\d+` で済ませると `127.999.999.999` のような IP ですらない値まで
 * ループバック扱いで通ってしまい、「許可リストは正確な値だけを通す」という
 * 上の方針と矛盾する。先行ゼロ（`127.01.0.1`）も曖昧なので通さない。
 */
const IPV4_LOOPBACK = /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * `HOST=localhost` はこの許可リストを通すが、**Bun の実 bind では `::1` にしか
 * bind しない**（IPv4 の `127.0.0.1` へは listen しない。timer-sync 側の再レビューが
 * 実 bind で確認）。Caddy 側が `127.0.0.1:PORT` を直接叩く構成だと、この組み合わせは
 * サービス全断になる。
 *
 * **裁定（timer-sync 側の controller、poker にも適用）: `localhost` は許可リストから
 * 落とさない。** `localhost` は実際にループバックであり、bind 先の不一致は
 * 「接続を丸ごと拒否する」という大きな音で失敗するため、静かな事故（レート制限だけが
 * 無効化される、等）にはならない。表記ゆれを避けたい運用は env の `HOST` に
 * `127.0.0.1` を明示すればよい。
 */
export function isLoopbackHost(host: string): boolean {
  // **比較の前に正規化する。** env の値には末尾改行・前後空白が混ざりやすく、
  // ホスト名は DNS 上そもそも大文字小文字を区別しない。正規化しないと
  // `HOST=127.0.0.1 `（末尾空白）や `HOST=Localhost` が「ループバック外」と
  // 誤判定され、**正当な設定で本番が起動しなくなる**（可用性の事故）。
  const normalized = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || IPV4_LOOPBACK.test(normalized);
}

/**
 * `NODE_ENV` として許容する既知の値。
 * リポジトリ内で実際に使われている値は `production` と `development` だけだが、
 * テストランナーが `NODE_ENV=test` を設定する経路があるため `test` も既知に含める。
 */
const KNOWN_NODE_ENVS: readonly string[] = ['production', 'development', 'test'];

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
  const withoutFormatChars = raw.replace(/\p{Cf}/gu, '');
  const trimmedOnce = withoutFormatChars.trim();
  const isQuoted =
    trimmedOnce.length >= 2 &&
    ((trimmedOnce.startsWith('"') && trimmedOnce.endsWith('"')) ||
      (trimmedOnce.startsWith("'") && trimmedOnce.endsWith("'")));
  const unquoted = isQuoted ? trimmedOnce.slice(1, -1) : trimmedOnce;
  return unquoted.trim().toLowerCase();
}

/**
 * `NODE_ENV` を正規化したうえで、既知の値かどうかを検査する（唯一の判定箇所）。
 *
 * 表記ゆれ（前後の空白・改行・大文字小文字・ゼロ幅スペース・BOM・引用符つき）を
 * 正規化で吸収したうえで、**正規化後になお空でなく既知の値でもない場合は起動時に
 * throw する。** 表記ゆれの列挙を増やし続ける代わりに、未知の値そのものを
 * 無言で通さないことで沈黙を不可能にする。
 *
 * 空文字（未設定）は許可する（本番以外の既定挙動を壊さないため）。
 */
function resolveNodeEnv(env: Record<string, string | undefined>): string {
  const raw = env['NODE_ENV'] ?? '';
  const normalized = normalizeNodeEnv(raw);
  if (normalized !== '' && !KNOWN_NODE_ENVS.includes(normalized)) {
    throw new Error(
      `NODE_ENV の値が未知です（受け取った値: ${JSON.stringify(raw)}）。` +
        `既知の値は ${KNOWN_NODE_ENVS.join(' / ')} のいずれかです。` +
        '表記ゆれ・誤設定によって本番の防御（requireClientAddress・HOST 検査・' +
        'ALLOWED_ORIGINS 検査）が無言ですり抜けるのを防ぐため起動を中止します。',
    );
  }
  return normalized;
}

/**
 * `NODE_ENV` が本番を意味するかどうかを判定する。
 * このため `loadPokerSyncConfig` 内の本番判定は必ずこの関数を経由させ、
 * `env['NODE_ENV'] === 'production'` を直接書かない。
 */
function isProductionEnv(env: Record<string, string | undefined>): boolean {
  return resolveNodeEnv(env) === 'production';
}

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
