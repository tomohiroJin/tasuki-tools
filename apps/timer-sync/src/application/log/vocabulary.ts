/**
 * ログに出す語彙の定義。**`publicText` の主たる呼び出し場所**（ADR 0012 D1）。
 *
 * 呼び出し側（handlers・delegation 等）がここの定数を引くことで、抜け道が
 * 事前に列挙できる語彙へ収まる。新しい語彙を足すときはここへ足す。
 *
 * **唯一の場所ではない。** 例外の `name`（`Error` / `TypeError` 等）は事前に
 * 列挙できないため、`server.ts` と `ws-adapter.ts` でも許可マーカー付きで
 * `publicText` を呼ぶ（`log-safe.ts` の docstring と
 * `scripts/audit-log-hygiene.mjs` の ALLOWED_FILES を参照）。
 */
import { publicText, type LogSafe } from "./log-safe.js";

/** AI 生成をスキップした理由（`AiLimiter.tryAcquire` の `reason` と 1 対 1）。 */
export const AI_SKIP_REASONS = {
  concurrent: publicText("concurrent"), // log-hygiene:allow 語彙定義
  cooldown: publicText("cooldown"), // log-hygiene:allow 語彙定義
  daily: publicText("daily"), // log-hygiene:allow 語彙定義
} as const satisfies Record<string, LogSafe>;

/**
 * AI 生成が失敗した理由の分類。自由文（例外メッセージ）は載せない。
 *
 * `ProviderFailureReason`（`ports/server-problem-provider.ts`）と 1 対 1。
 * `outputTooLarge` / `processError` は 2026-08-13 のレビューで追加。実際の
 * 失敗理由を洗い出したところ「出力サイズ超過」と「claude -p の非 0 終了」が
 * timeout/invalid/spawnFailed のどれとも異なる固有の失敗モードだったため、
 * `other` へ潰さず区別できるようにした。
 */
export const AI_FAILURE_REASONS = {
  timeout: publicText("timeout"), // log-hygiene:allow 語彙定義
  invalid: publicText("invalid"), // log-hygiene:allow 語彙定義
  spawnFailed: publicText("spawn-failed"), // log-hygiene:allow 語彙定義
  outputTooLarge: publicText("output-too-large"), // log-hygiene:allow 語彙定義
  processError: publicText("process-error"), // log-hygiene:allow 語彙定義
  other: publicText("other"), // log-hygiene:allow 語彙定義
} as const satisfies Record<string, LogSafe>;
