/**
 * テスト用の Logger / RefEncoder（apps/sync 共有）
 *
 * `Logger` / `RefEncoder` を要求するコンストラクタ（`ProblemDelegator` /
 * `WsAdapter` 等）はテストでも本物の型を満たす必要がある。ログの中身を
 * 検証しないテストでは `testLogger`（何もしない sink）を渡せば足り、
 * 検証したいテストは `collectingLogger()` で行を配列に貯めて読む。
 *
 * ソルトは固定値。テスト間で相関 ID が変わっても困らないうえ、
 * 期待値を決め打ちしたいテストでは同じ入力から同じ ID が要る。
 */

import { createLogger, type Logger, type LogLevel } from "../../src/application/log/logger.js";
import { createRefEncoder, type RefEncoder } from "../../src/application/log/ref-encoder.js";

/** 何もしない Logger。ログの中身を検証しないテストのデフォルトに使う。 */
export const testLogger: Logger = createLogger(() => {});

/** 固定ソルトの RefEncoder。ログの中身を検証しないテストのデフォルトに使う。 */
export const testRefEncoder: RefEncoder = createRefEncoder(Buffer.from("test-salt-fixed"));

/** 出力行を配列に貯める Logger を作る。ログの中身を検証したいテストで使う。 */
export function collectingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger((_level: LogLevel, line: string) => lines.push(line));
  return { logger, lines };
}
