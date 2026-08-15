/**
 * `catch (err)` で受けた `err` から、ログへ出してよい「例外の分類」を安全に取り出す。
 *
 * timer-sync（`apps/timer-sync/src/adapters/ws-adapter.ts`）が 6 ラウンドの
 * 敵対的レビューを経て固めた形を、poker-sync にも同じガードが要る（#103 Task 7
 * レビュー S-2）ため共有する。複製すると `isLoopbackHost` 等（S-1）と同じ
 * 二重正本の問題が再発するため、ここへ 1 本化する。
 *
 * **`err as Error` は TypeScript が受け入れるだけの嘘で、実行時には何も保証しない。**
 * `throw null` / `throw undefined` / `name` ゲッタ自体が throw するオブジェクトが
 * 実際に来ると、`(err as Error).name` は catch 節の中で TypeError を投げて外へ
 * 抜ける（timer-sync のレビューが実測）。ここでは `instanceof Error` で実行時に
 * 型を確かめ、`name` の読み出し自体が throw するケースにも `try/catch` で備える。
 *
 * 戻り値は素の `string`。`LogSafe`（ADR 0012 D1 のブランド型）は timer-sync の
 * ログ基盤に閉じた型で、`scripts/audit-log-hygiene.mjs` の ALLOWED_FILES も
 * アプリ側のファイルに限定されている。ブランド付けは呼び出し側に委ねる
 * （timer-sync は `publicText()` でラップ、poker-sync はそのまま使う）。
 */

/** {@link classifyErrorKind} が返す「例外の分類」に許す最大長。 */
const ERROR_KIND_MAX_LENGTH = 40;

/**
 * `err.name`（や `typeof err`）をログへ出してよい形に丸める。
 *
 * `name` は任意長・任意文字列にできるため、素通しすると
 * `on-connect-error name=Error xff=203.0.113.88 level=info fake` のように
 * 偽の `key=value` を 1 行内に生やせる。英数字と最小限の記号だけを許可し、
 * それ以外は `?` に丸め、長さも上限で切る。
 */
function sanitizeErrorKind(raw: string): string {
  const truncated = raw.slice(0, ERROR_KIND_MAX_LENGTH);
  const sanitized = truncated.replace(/[^A-Za-z0-9_.:-]/g, "?");
  return sanitized === "" ? "unknown" : sanitized;
}

/**
 * `catch (err)` で受けた `err` から、ログへ出してよい「例外の分類」を返す。
 */
export function classifyErrorKind(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    try {
      raw = typeof err.name === "string" ? err.name : "Error";
    } catch {
      raw = "Error"; // name ゲッタが throw した
    }
  } else {
    raw = typeof err; // "object"（null 含む）| "undefined" | "string" | ...
  }
  return sanitizeErrorKind(raw);
}
