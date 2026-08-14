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

import { loadSyncConfig, DEFAULT_AI_PROBLEM_MODEL } from "./config.js";
import { createSyncServer } from "./create-sync-server.js";
import { createLogger } from "./application/log/logger.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
import { publicText } from "./application/log/log-safe.js";
import { buildListeningLogFields } from "./listening-log.js";

const logger = createLogger(consoleLogSink);

// 未捕捉の例外・未処理の rejection も 1 本の経路へ通す（ADR 0012 D1）。
// 既定ハンドラに任せると、資格情報を含む例外メッセージがスタックごと journal へ出る。
//
// **両者とも process.exit(1) で終える。** ハンドラを置く目的は「何が起きたかを
// 出さないこと」であって「プロセスを生かすこと」ではない。ハンドラが無いとき、
// Bun は未捕捉例外でも未処理 rejection でも exit 1 で終える（2026-08-13 実測）。
// ログを出すだけのハンドラを置くと、未処理 rejection でプロセスが**落ちなくなり**、
// systemd の Restart による復旧が働かなくなる。状態の一貫性を失ったまま走り続ける
// ほうが、落ちて再起動するより危ない（揮発インメモリ設計＝憲法 原則 III のため、
// 再起動の代償はルームの消失だけで、永続データは壊れない）。
// epic #67 の制約「利用者から見える振る舞いを変えない」にも、こちらが揃う。
process.on("uncaughtException", (err) => {
  logger.error("uncaught", { name: publicText(err.name) }); // log-hygiene:allow 例外の分類のみ
  process.exit(1);
});
process.on("unhandledRejection", () => {
  logger.error("unhandled-rejection");
  process.exit(1);
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

// フィールドの組み立ては listening-log.ts（副作用なしにテストするための切り出し）。
logger.info("listening", buildListeningLogFields(config));
logger.info("admin", { enabled: config.adminToken !== undefined });
logger.info("ai", {
  enabled: config.claudeOauthToken !== undefined && config.aiUnlockKey !== undefined,
  defaultModel: config.aiProblemModel === DEFAULT_AI_PROBLEM_MODEL,
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
