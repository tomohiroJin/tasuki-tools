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
import type { Room, ServerMsg } from "@tdd-mob/core";

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

const delegator = new ProblemDelegator({ store, clock, broadcaster });
const handlers = makeHandlers({ store, clock, broadcaster, codeGen, scheduler, delegator, maxRooms: config.maxRooms });
const presenceManager = new PresenceManager({ store, broadcaster, clock });

wsAdapter = new WsAdapter({
  port: config.port,
  host: config.host,
  allowedOrigins: config.allowedOrigins,
  maxConnections: config.maxConnections,
  onMessage: async (connId, msg) => {
    const cmd = msg as { command: string; [key: string]: unknown };

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
});

const RECLAIM_SWEEP_MS = 60_000;
const reclaimer = new RoomReclaimer({
  store,
  idleTtlMs: config.roomIdleTtlMs,
  onReclaim: (code) => {
    scheduler.clear(code);
    delegator.cancel(code);
    presenceManager.clearRoomTimers(code);
    handlers.releaseRoom(code);
    store.remove(code);
  },
});
reclaimer.start(RECLAIM_SWEEP_MS);

console.log(
  `🚀 同期サーバー起動 host=${config.host} port=${config.port} ` +
    `maxConn=${config.maxConnections} maxRooms=${config.maxRooms}`,
);
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
