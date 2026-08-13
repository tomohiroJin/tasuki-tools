/**
 * ログの整形と Logger インターフェース（純粋・ADR 0012 D1）。
 *
 * 実際の書き出しは `LogSink`（アダプタ）へ委ねる。テストは配列に貯める sink を
 * 差し込むだけでよく、標準出力を横取りする必要がない。
 */
import type { LogField } from "./log-safe.js";

export type LogLevel = "info" | "warn" | "error";

/** 実際の書き出し先。本番は `consoleLogSink`、テストは配列へ貯める関数。 */
export type LogSink = (level: LogLevel, line: string) => void;

export interface Logger {
  info(event: string, fields?: Record<string, LogField>): void;
  warn(event: string, fields?: Record<string, LogField>): void;
  error(event: string, fields?: Record<string, LogField>): void;
}

/**
 * 制御文字を落とす（ADR 0012 D12）。
 *
 * 利用者由来の値（`requestId` 等）は境界で最大長も文字種も縛られていない。
 * 改行が通ると journal に偽の行を作れるため、**整形の側で必ず落とす**。
 * 呼び出し側の善意に頼らない。
 */
function stripControlChars(value: string): string {
  // 制御文字（C0 と DEL）を落とす。**リテラルの制御文字を直接書かない**
  // — 転送経路で消えると検査が黙って空振りする。
  // no-control-regex は「正規表現に制御文字を書くのは大抵うっかりミス」という
  // 前提のルールだが、ここは制御文字そのものが対象（ADR 0012 D12）なので意図的である。
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

/** `event k=v k=v` の 1 行に整形する。journalctl の grep で追える形を保つ。 */
export function formatLine(event: string, fields: Record<string, LogField> = {}): string {
  const head = stripControlChars(event);
  const parts = Object.entries(fields).map(
    ([k, v]) => `${stripControlChars(k)}=${stripControlChars(String(v))}`,
  );
  return parts.length === 0 ? head : `${head} ${parts.join(" ")}`;
}

export function createLogger(sink: LogSink): Logger {
  return {
    info: (event, fields) => sink("info", formatLine(event, fields)),
    warn: (event, fields) => sink("warn", formatLine(event, fields)),
    error: (event, fields) => sink("error", formatLine(event, fields)),
  };
}
