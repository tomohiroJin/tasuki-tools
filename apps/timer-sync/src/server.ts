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

const config = (() => {
  try {
    return loadSyncConfig(process.env);
  } catch (e) {
    console.error(`❌ 設定エラー: ${(e as Error).message}`);
    process.exit(1);
  }
})();

const server = createSyncServer(config);

console.log(
  `🚀 同期サーバー起動 host=${config.host} port=${config.port} ` +
    `maxConn=${config.maxConnections} maxRooms=${config.maxRooms} ` +
    `heartbeat=${config.heartbeatIntervalMs}ms×${config.heartbeatMaxMisses}回`,
);
console.log(
  `管理エンドポイント: ${config.adminToken ? "有効 (/status, /admin/rooms)" : "無効 (ADMIN_TOKEN 未設定)"}`,
);
console.log(
  `AI お題生成: ${server.aiReady ? `有効 (model=${config.aiProblemModel})` : "無効 (トークン/合言葉 未設定)"}`,
);
if (config.allowedOrigins.length === 0) {
  console.warn(
    "⚠ ALLOWED_ORIGINS 未設定: 全 Origin からの WebSocket 接続を許可します（dev 用）。",
  );
}

// グレースフルシャットダウン
process.on("SIGTERM", async () => {
  console.log("SIGTERM 受信: シャットダウン中...");
  await server.close();
  process.exit(0);
});
