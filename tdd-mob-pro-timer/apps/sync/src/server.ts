/**
 * 同期サーバーのエントリポイント
 * T040: FR-013
 */

import { makeHandlers } from "./application/handlers.js";
import { PresenceManager } from "./application/presence.js";
import { Scheduler } from "./application/schedule.js";
import { ProblemDelegator } from "./application/problem-delegation.js";
import { WsAdapter } from "./adapters/ws-adapter.js";
import { InMemoryRoomStore } from "./adapters/in-memory-room-store.js";
import { SystemClock } from "./adapters/system-clock.js";
import { NanoidCodeGen } from "./adapters/nanoid-code-gen.js";
import { loadSyncConfig } from "./config.js";
import { RoomReclaimer } from "./application/room-reclaimer.js";
import { buildAdminReport, handleAdminHttp } from "./application/admin.js";
import { AiLimiter } from "./application/ai-limits.js";
import { ClaudeCliProblemProvider } from "./adapters/claude-cli-problem-provider.js";
import type { Room, ServerMsg, Command } from "@tdd-mob/core";

const config = (() => {
  try {
    return loadSyncConfig(process.env);
  } catch (e) {
    console.error(`❌ 設定エラー: ${(e as Error).message}`);
    process.exit(1);
  }
})();

const store = new InMemoryRoomStore();
const clock = new SystemClock();
const codeGen = new NanoidCodeGen();
const scheduler = new Scheduler(clock);

/** Broadcaster 実装（WS アダプタへの橋渡し） */
let wsAdapter: WsAdapter;

const broadcaster = {
  broadcastSnapshot(roomCode: string, room: Room): void {
    const connIds = room.participants
      .filter((p) => p.connId !== null && p.presence !== "offline")
      .map((p) => p.connId!);
    wsAdapter.broadcast(connIds, { type: "snapshot", room });
  },
  sendTo(connId: string, msg: ServerMsg): void {
    wsAdapter.send(connId, msg);
  },
  broadcastSignal(roomCode: string, msg: ServerMsg): void {
    const room = store.get(roomCode);
    if (!room) return;
    const connIds = room.participants
      .filter((p) => p.connId !== null && p.presence !== "offline")
      .map((p) => p.connId!);
    wsAdapter.broadcast(connIds, msg);
  },
};

// AI お題生成（トークンと合言葉が両方あるときだけ有効。spec 2026-06-12 参照）
const aiReady = Boolean(config.claudeOauthToken && config.aiUnlockKey);
const aiLimiter = aiReady
  ? new AiLimiter({ clock, dailyLimit: config.aiDailyLimit })
  : undefined;
const serverProvider = aiReady
  ? new ClaudeCliProblemProvider({
      token: config.claudeOauthToken!,
      model: config.aiProblemModel,
    })
  : undefined;

const delegator = new ProblemDelegator({
  store,
  clock,
  broadcaster,
  serverProvider,
  aiLimiter,
  aiTimeoutMs: config.aiGenerationTimeoutMs,
});
const handlers = makeHandlers({
  store,
  clock,
  broadcaster,
  codeGen,
  scheduler,
  delegator,
  maxRooms: config.maxRooms,
  // トークン未設定なら合言葉も渡さない＝解錠は常に失敗（存在秘匿）
  aiUnlockKey: aiReady ? config.aiUnlockKey : undefined,
});
const presenceManager = new PresenceManager({
  store,
  broadcaster,
  clock,
  // ドライバー不在の猶予後繰り上げ（R2-1）。handlers のスケジューラ経由で交代＋タイマー再アンカー。
  onDriverAbsence: handlers.advanceForAbsence,
});

const RECLAIM_SWEEP_MS = 60_000;
// httpHandler クロージャが reclaimer.reclaimedCount を参照するため、
// wsAdapter 生成（クロージャ定義）より前に reclaimer を宣言する（TDZ 回避）。
const reclaimer = new RoomReclaimer({
  store,
  idleTtlMs: config.roomIdleTtlMs,
  onReclaim: (code, idleMs) => {
    scheduler.clear(code);
    delegator.cancel(code);
    presenceManager.clearRoomTimers(code);
    handlers.releaseRoom(code);
    store.remove(code);
    // 運用ログ（journalctl -u tasuki-sync | grep reclaimed で追える・R3-1）。
    console.log(`room ${code} reclaimed: idle ${idleMs}ms`);
  },
});

wsAdapter = new WsAdapter({
  port: config.port,
  host: config.host,
  allowedOrigins: config.allowedOrigins,
  maxConnections: config.maxConnections,
  heartbeatIntervalMs: config.heartbeatIntervalMs,
  heartbeatMaxMisses: config.heartbeatMaxMisses,
  onMessage: async (connId, msg) => {
    // msg は ws-adapter 側で CommandSchema（valibot）に通した検証済みの値であり、
    // 実体は Command 型と一致する（onMessage の型は unknown のままなのでここでキャストする）。
    const cmd = msg as Command;

    if (cmd.command === "presence.ping") {
      presenceManager.handlePing(connId);
      return;
    }

    await handlers.handleCommand(connId, cmd);
  },
  onDisconnect: (connId) => {
    presenceManager.handleDisconnect(connId);
    // レート制限用の失敗履歴を解放（マップのリーク防止）。
    handlers.handleConnectionClose(connId);
  },
  // 管理エンドポイント（/status・/admin/rooms）を WS サーバの HTTP 層に配線（R3-2）。
  httpHandler: (req) =>
    handleAdminHttp(req.method, req.url, req.headers, {
      adminToken: config.adminToken,
      getReport: () =>
        buildAdminReport(
          store.list(),
          reclaimer.reclaimedCount,
          aiLimiter ? { today: aiLimiter.todayCount, total: aiLimiter.totalCount } : undefined,
        ),
    }),
});

reclaimer.start(RECLAIM_SWEEP_MS);

console.log(
  `🚀 同期サーバー起動 host=${config.host} port=${config.port} ` +
    `maxConn=${config.maxConnections} maxRooms=${config.maxRooms} ` +
    `heartbeat=${config.heartbeatIntervalMs}ms×${config.heartbeatMaxMisses}回`,
);
console.log(
  `管理エンドポイント: ${config.adminToken ? "有効 (/status, /admin/rooms)" : "無効 (ADMIN_TOKEN 未設定)"}`,
);
console.log(`AI お題生成: ${aiReady ? `有効 (model=${config.aiProblemModel})` : "無効 (トークン/合言葉 未設定)"}`);
if (config.allowedOrigins.length === 0) {
  console.warn(
    "⚠ ALLOWED_ORIGINS 未設定: 全 Origin からの WebSocket 接続を許可します（dev 用）。",
  );
}

// グレースフルシャットダウン
process.on("SIGTERM", async () => {
  console.log("SIGTERM 受信: シャットダウン中...");
  reclaimer.stop();
  scheduler.clearAll();
  delegator.cancelAll();
  await wsAdapter.close();
  process.exit(0);
});
