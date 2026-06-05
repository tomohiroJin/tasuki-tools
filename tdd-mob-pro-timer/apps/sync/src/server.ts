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
import type { Room, ServerMsg } from "@tdd-mob/core";

const PORT = parseInt(process.env["PORT"] ?? "8787", 10);
const ALLOWED_ORIGINS = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .filter(Boolean);

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
const handlers = makeHandlers({ store, clock, broadcaster, codeGen, scheduler, delegator });
const presenceManager = new PresenceManager({ store, broadcaster, clock });

wsAdapter = new WsAdapter({
  port: PORT,
  allowedOrigins: ALLOWED_ORIGINS,
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

console.log(`🚀 同期サーバー起動 port=${PORT}`);
// ALLOWED_ORIGINS 未設定だと Origin 検証がスキップされ全 Origin を許可する（CSWSH リスク）。
// 開発では許容だが、本番デプロイ時は必ず設定する。空のときは明示的に警告する。
if (ALLOWED_ORIGINS.length === 0) {
  console.warn(
    "⚠ ALLOWED_ORIGINS 未設定: 全 Origin からの WebSocket 接続を許可します。" +
      "本番では ALLOWED_ORIGINS にカンマ区切りで許可オリジンを設定してください。",
  );
}

// グレースフルシャットダウン
process.on("SIGTERM", async () => {
  console.log("SIGTERM 受信: シャットダウン中...");
  scheduler.clearAll();
  delegator.cancelAll();
  await wsAdapter.close();
  process.exit(0);
});
