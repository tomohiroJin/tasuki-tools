/**
 * ログに出す語彙の定義。`publicText` を呼ぶ唯一の場所（ADR 0012 D1）。
 *
 * 呼び出し側（handlers・delegation 等）がここの定数を引くことで、抜け道が
 * 1 ファイルに閉じる。新しい語彙を足すときはここへ足す。
 */
import { publicText, type LogSafe } from "./log-safe.js";

/** AI 生成をスキップした理由（`AiLimiter.tryAcquire` の `reason` と 1 対 1）。 */
export const AI_SKIP_REASONS = {
  concurrent: publicText("concurrent"), // log-hygiene:allow 語彙定義
  cooldown: publicText("cooldown"), // log-hygiene:allow 語彙定義
  daily: publicText("daily"), // log-hygiene:allow 語彙定義
} as const satisfies Record<string, LogSafe>;

/** AI 生成が失敗した理由の分類。自由文（例外メッセージ）は載せない。 */
export const AI_FAILURE_REASONS = {
  timeout: publicText("timeout"), // log-hygiene:allow 語彙定義
  invalid: publicText("invalid"), // log-hygiene:allow 語彙定義
  spawnFailed: publicText("spawn-failed"), // log-hygiene:allow 語彙定義
  other: publicText("other"), // log-hygiene:allow 語彙定義
} as const satisfies Record<string, LogSafe>;
