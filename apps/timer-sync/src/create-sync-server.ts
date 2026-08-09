/**
 * 同期サーバーの配線（組み立て）を 1 箇所に閉じ込めた関数。
 *
 * store / clock / codeGen / scheduler / broadcaster / delegator / handlers /
 * presenceManager / reclaimer / WsAdapter の相互参照は、順序と受け渡しに
 * 暗黙の前提がいくつもある（broadcaster が wsAdapter を前方参照する、
 * reclaimer を wsAdapter より先に宣言して TDZ を避ける、presence の
 * onDriverAbsence に handlers.advanceForAbsence を挿す、など）。
 *
 * ⚠ **本番（`server.ts`）とテストが必ずこの関数を通ることが要点である。**
 * テスト側で同じ組み立てを書き写すと、写しが本番からずれた瞬間に
 * 「配線が繋がっているか」の検査が死ぬ（テストは緑のまま本番だけ壊れる）。
 * Issue #80 が塞ぎたい穴はまさにそこなので、組み立ての知識はこのファイルだけが持つ。
 *
 * `server.ts` に残すのは、プロセスとしての振る舞い（設定読み込み失敗時の
 * `process.exit(1)`・起動ログ・SIGTERM）だけである。
 */

import { makeHandlers } from "./application/handlers.js";
import { PresenceManager } from "./application/presence.js";
import { Scheduler } from "./application/schedule.js";
import { ProblemDelegator } from "./application/problem-delegation.js";
import { WsAdapter } from "./adapters/ws-adapter.js";
import { InMemoryRoomStore } from "./adapters/in-memory-room-store.js";
import { SystemClock } from "./adapters/system-clock.js";
import { NanoidCodeGen } from "./adapters/nanoid-code-gen.js";
import { RoomReclaimer } from "./application/room-reclaimer.js";
import { buildAdminReport, handleAdminHttp } from "./application/admin.js";
import { AiLimiter } from "./application/ai-limits.js";
import { ClaudeCliProblemProvider } from "./adapters/claude-cli-problem-provider.js";
import type { SyncConfig } from "./config.js";
import type { Room, ServerMsg, Command } from "@tasuki/timer-core";

/** アイドルルーム回収の sweep 間隔（ms）。 */
const RECLAIM_SWEEP_MS = 60_000;

/** 組み立て済みの同期サーバー。 */
export interface SyncServer {
  /** WS と管理 HTTP を受けているアダプタ。実際に listen したポートは `wsAdapter.port`。 */
  readonly wsAdapter: WsAdapter;
  /** ルーム保管。運用ログや検証から状態を覗くために公開する。 */
  readonly store: InMemoryRoomStore;
  /**
   * AI お題生成が有効か（OAuth トークンと解錠合言葉が**両方**あるときだけ true）。
   * 起動ログの表示に使う。
   */
  readonly aiReady: boolean;
  /** タイマー類を止めて WS を閉じる（SIGTERM とテストの後始末で共用）。 */
  close(): Promise<void>;
}

/** 設定から同期サーバー一式を組み立てて起動する。 */
export function createSyncServer(config: SyncConfig): SyncServer {
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
      handleAdminHttp(req.method, req.path, req.headers, {
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

  return {
    wsAdapter,
    store,
    aiReady,
    close: async () => {
      reclaimer.stop();
      scheduler.clearAll();
      delegator.cancelAll();
      // 不在猶予タイマー（ホスト委譲・ドライバー繰り上げ）も解放する。
      // 本番は直後に process.exit(0) するため観測できる差は無いが、
      // 同一プロセスでサーバーを何度も起動し直すテストでは、放置すると
      // 閉じたはずのサーバーのタイマーが後から発火してしまう。
      presenceManager.clearAllTimers();
      await wsAdapter.close();
    },
  };
}
