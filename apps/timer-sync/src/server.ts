/**
 * 同期サーバーのエントリポイント
 * T040: FR-013
 *
 * ここが受け持つのは「プロセスとしての振る舞い」だけである。
 * ・env の読み込みと失敗時の終了（process.exit(1)）
 * ・起動ログ
 * ・SIGTERM でのグレースフルシャットダウン
 *
 * 依存の組み立て（配線）は `create-sync-server.ts` の `createSyncServer()` が持つ。
 * テストも同じ関数を通ることで、配線がずれたときにテストが本当に落ちる（Issue #80）。
 */

import { loadSyncConfig } from "./config.js";
import { createSyncServer } from "./create-sync-server.js";
import { createLogger } from "./application/log/logger.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
import { publicText } from "./application/log/log-safe.js";

const logger = createLogger(consoleLogSink);

// 未捕捉の例外・未処理の rejection も 1 本の経路へ通す（ADR 0012 D1）。
// 既定ハンドラに任せると、資格情報を含む例外メッセージがスタックごと journal へ出る。
process.on("uncaughtException", (err) => {
  logger.error("uncaught", { name: publicText(err.name) }); // log-hygiene:allow 例外の分類のみ
  process.exit(1);
});
process.on("unhandledRejection", () => {
  logger.error("unhandled-rejection");
});

const config = (() => {
  try {
    return loadSyncConfig(process.env);
  } catch (e) {
    logger.error("config-error", { name: publicText((e as Error).name) }); // log-hygiene:allow 例外の分類のみ
    process.exit(1);
  }
})();

const server = createSyncServer(config);

logger.info("listening", {
  port: config.port,
  maxConn: config.maxConnections,
  maxRooms: config.maxRooms,
});
logger.info("admin", { enabled: config.adminToken !== undefined });
logger.info("ai", {
  enabled: config.claudeOauthToken !== undefined && config.aiUnlockKey !== undefined,
});
if (config.allowedOrigins.length === 0) {
  logger.warn("origins-unset");
}

// グレースフルシャットダウン
process.on("SIGTERM", async () => {
  logger.info("sigterm");
  await server.close();
  process.exit(0);
});
