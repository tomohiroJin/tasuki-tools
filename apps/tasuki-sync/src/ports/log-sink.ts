/**
 * LogSink ポート — ログの行の書き出し先（ADR 0012 D1）。
 *
 * 本番は `adapters/console-log-sink.ts`（唯一の実出力口）、テストは配列へ貯める関数を渡す。
 * #367 で `application/log/logger.ts` から移した。整形と `Logger`（アプリケーションが使う口）は
 * `application/log/` に残る。
 */

export type LogLevel = "info" | "warn" | "error";

/** 実際の書き出し先。整形済みの 1 行（`event k=v k=v`）を受け取る。 */
export type LogSink = (level: LogLevel, line: string) => void;
