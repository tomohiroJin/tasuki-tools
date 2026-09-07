/**
 * 唯一の実出力口（ADR 0012 D1）。**このファイル以外で `console` を呼ばない。**
 *
 * `scripts/audit-log-hygiene.mjs` がこのファイルを許可対象として名前で固定し、
 * 各行に許可マーカーを要求する。マーカーが消えても、ファイルが許可一覧から
 * 消えても検査は赤になる（どちらの向きにも穴を作らない）。
 */
import type { LogSink } from "../application/log/logger.js";

export const consoleLogSink: LogSink = (level, line) => {
  if (level === "error") {
    console.error(line); // log-hygiene:allow 唯一の実出力口
  } else if (level === "warn") {
    console.warn(line); // log-hygiene:allow 唯一の実出力口
  } else {
    console.log(line); // log-hygiene:allow 唯一の実出力口
  }
};
