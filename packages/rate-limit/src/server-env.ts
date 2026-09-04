/**
 * sync サーバー（timer-sync・poker-sync）が env の生文字列（HOST・NODE_ENV）を
 * 解釈するために使う、共通の下ごしらえ（#103 Task 7 レビュー S-1）。
 *
 * 元々 `apps/timer-sync/src/config.ts` と `apps/poker-sync/src/config.ts` に
 * 同じ 6 定義（`LOOPBACK_HOSTS` / `IPV4_LOOPBACK` / `isLoopbackHost` /
 * `KNOWN_NODE_ENVS` / `normalizeNodeEnv` / `resolveNodeEnv`）と `isProductionEnv`
 * が複製されていた。同期はコメント頼みで、`docs/adr/0002` が禁じる二重正本
 * だったため、ここへ 1 本化する。
 *
 * `packages/protocol` はブラウザバンドルにも載るため node 専用の処理を置けない
 * （`net.isIP` 等）。`packages/rate-limit` は既に `node:crypto` / `node:net` を
 * 前提にした node 専用パッケージであり、sync サーバー（poker-sync・timer-sync）
 * 以外からは使われない想定のため、ここへ置く。
 */

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
 * bind しない**（IPv4 の `127.0.0.1` へは listen しない。timer-sync の敵対的
 * レビューが実 bind で確認済み）。Caddy 側が `127.0.0.1:PORT` を直接叩く構成だと、
 * この組み合わせはサービス全断になる。
 *
 * **裁定（timer-sync 側の controller・poker-sync にも適用）: `localhost` は
 * 許可リストから落とさない。** `localhost` は実際にループバックであり、bind 先の
 * 不一致は「接続を丸ごと拒否する」という大きな音で失敗するため、静かな事故
 * （レート制限だけが無効化される、等）にはならない。表記ゆれを避けたい運用は
 * env の `HOST` に `127.0.0.1` を明示すればよい。
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
  const raw = env["NODE_ENV"] ?? "";
  const normalized = normalizeNodeEnv(raw);
  if (normalized !== "" && !KNOWN_NODE_ENVS.includes(normalized)) {
    throw new Error(
      `NODE_ENV の値が未知です（受け取った値: ${JSON.stringify(raw)}）。` +
        `既知の値は ${KNOWN_NODE_ENVS.join(" / ")} のいずれかです。` +
        "表記ゆれ・誤設定によって本番の防御（requireClientAddress・HOST 検査・" +
        "ALLOWED_ORIGINS 検査・AI_UNLOCK_KEY の下限検査）が無言ですり抜けるのを防ぐため" +
        "起動を中止します。",
    );
  }
  return normalized;
}

/**
 * `NODE_ENV` が本番を意味するかどうかを判定する。
 * 呼び出し側の本番判定は必ずこの関数を経由させ、
 * `env["NODE_ENV"] === "production"` を直接書かないこと。
 *
 * 正規化後になお未知の値であれば `resolveNodeEnv` が throw する
 * （本番判定を求めただけで起動が止まりうる。呼び出し側の起動シーケンスの
 * 早い段階でこの関数を呼ぶこと）。
 */
export function isProductionEnv(env: Record<string, string | undefined>): boolean {
  return resolveNodeEnv(env) === "production";
}
