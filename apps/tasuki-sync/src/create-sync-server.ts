/**
 * 同期サーバーの配線（組み立て）を 1 箇所に閉じ込めた関数。
 *
 * **#95 S2 で timer と poker の 2 本を 1 プロセスへ統合した**（設計正本 D9）。
 * 旧 `apps/poker-sync/src/create-sync-server.ts` の組み立てはこの関数の後半にある。
 *
 * **#95 S4a で共有するものが増えた。** いま 2 つの文脈が共有するのは、接続層
 * （`WsAdapter`）・**名簿（`RoomStore`）**・**復帰トークン（`TokenStore`）**の 3 つである。
 * ツールの状態（`TimerStore` / `RoundStore`）・時計・ID 生成・配信はそれぞれ別のまま
 * であり、単一の巨大ストアにはしない（設計正本 §5.5 / D16）。
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

import { randomBytes } from "node:crypto";
import {
  createClientKeyDeriver,
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
} from "@tasuki/rate-limit";
import { makeHandlers } from "./application/handlers.js";
import { PresenceManager } from "./application/presence.js";
import { Scheduler } from "./application/schedule.js";
import { ProblemDelegator } from "./application/problem-delegation.js";
import { WsAdapter } from "./adapters/ws-adapter.js";
import { InMemoryRoomStore } from "./adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "./adapters/in-memory-timer-store.js";
import { buildTimerSnapshotRoom } from "./application/timer-snapshot-dto.js";
import { SystemClock } from "./adapters/system-clock.js";
import { NanoidCodeGen } from "./adapters/nanoid-code-gen.js";
import { RoomReclaimer } from "./application/room-reclaimer.js";
import { createRoomDestroyer } from "./application/destroy-room.js";
import { buildAdminReport, handleAdminHttp } from "./application/admin.js";
import { AiLimiter } from "./application/ai-limits.js";
import { ClaudeCliProblemProvider } from "./adapters/claude-cli-problem-provider.js";
import { createLogger } from "./application/log/logger.js";
import { createTokenStore } from "./application/token-store.js";
import { createRefEncoder } from "./application/log/ref-encoder.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
import { InMemoryRoundStore } from "./poker/adapters/in-memory-round-store.js";
import { createPerformanceClock } from "./poker/adapters/performance-clock.js";
import { createCryptoIdGen } from "./poker/adapters/crypto-id-gen.js";
import { createWsBroadcaster } from "./poker/adapters/ws-broadcaster.js";
import { makeHandlers as makePokerHandlers } from "./poker/application/handlers.js";
import type { SyncConfig } from "./config.js";
import type { Room, ServerMsg, Command } from "@tasuki/timer-core";

/** アイドルルーム回収の sweep 間隔（ms）。 */
const RECLAIM_SWEEP_MS = 60_000;

/** 組み立て済みの同期サーバー。 */
export interface SyncServer {
  /** WS と管理 HTTP を受けているアダプタ。実際に listen したポートは `wsAdapter.port`。 */
  readonly wsAdapter: WsAdapter;
  /** 名簿の保管。運用ログや検証から状態を覗くために公開する（#95 S4a）。 */
  readonly store: InMemoryRoomStore;
  /** timer の状態の保管。名簿とは `code` で対になる（#95 S4a）。 */
  readonly timers: InMemoryTimerStore;
  /**
   * poker の状態（投票ラウンド）の保管。**名簿は `store` に統合済み**（#95 S4a）。
   * timer の `timers` と同じ位置づけで、名簿とはルームコードで対になる。
   */
  readonly rounds: InMemoryRoundStore;
  /** 実際に bind したポート。`PORT=0` 起動のときはここが正しい値。 */
  readonly port: number;
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
  const timers = new InMemoryTimerStore();
  const rounds = new InMemoryRoundStore();
  const clock = new SystemClock();
  /**
   * 復帰トークンとパスフレーズの保管。**timer と poker で 1 個を共有する**（#95 S4a）。
   *
   * poker の復帰トークンが `Participant.token` から `token-store` へ寄ったため、
   * 別々に持つと `destroyRoom` / `releaseRoom` が片方しか解放しない
   * （名簿は 1 つなのに、ルームを消してももう片方のトークンが残る）。
   */
  const tokens = createTokenStore();

  /**
   * 名簿と timer の状態を合成した wire の `Room` の一覧（#95 S4a）。
   *
   * 管理レポート（`buildAdminReport`）は「利用者から見えているルーム」を数えるので、
   * 合成後の形を渡す。片方しか無いルームは（作成・破棄が対なので）通常は現れないが、
   * 現れたら数えない。
   */
  const snapshotRooms = (): Room[] =>
    store.list().flatMap((membership) => {
      const timer = timers.get(membership.code);
      return timer ? [buildTimerSnapshotRoom(membership, timer)] : [];
    });
  const codeGen = new NanoidCodeGen();
  const scheduler = new Scheduler(clock);

  // ログの出口はここで 1 本に決める（ADR 0012 D1）。
  // ソルトはプロセス起動ごと。再起動で相関が切れるのは揮発設計と整合する（D2）。
  const logger = createLogger(consoleLogSink);
  const refEncoder = createRefEncoder(randomBytes(32));

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
    timers,
    clock,
    broadcaster,
    serverProvider,
    aiLimiter,
    aiTimeoutMs: config.aiGenerationTimeoutMs,
    logger,
    refEncoder,
  });
  /**
   * ルーム破棄の共通経路（`destroy-room.ts`。Issue #79）。
   *
   * 後始末は `presenceManager` と `handlers.releaseRoom` に依存する一方、
   * `handlers` 自身が在室者 0 人の退出でこれを必要とするため相互依存になる。
   * `wsAdapter` と同じく「後から代入するクロージャ」で解く（TDZ 回避）。
   */
  let destroyRoom: (roomCode: string) => void;

  const handlers = makeHandlers({
    store,
    timers,
    tokens,
    clock,
    broadcaster,
    codeGen,
    scheduler,
    delegator,
    maxRooms: config.maxRooms,
    // トークン未設定なら合言葉も渡さない＝解錠は常に失敗（存在秘匿）
    aiUnlockKey: aiReady ? config.aiUnlockKey : undefined,
    destroyRoom: (roomCode) => destroyRoom(roomCode),
  });
  const presenceManager = new PresenceManager({
    store,
    timers,
    broadcaster,
    clock,
    // ドライバー不在の猶予後繰り上げ（R2-1）。handlers のスケジューラ経由で交代＋タイマー再アンカー。
    onDriverAbsence: handlers.advanceForAbsence,
  });

  // 後始末を契機ごとに並べ直すと片方だけが更新されて必ずずれるため、内容と順序は
  // `destroy-room.ts` の 1 箇所にしか持たない。契機はアイドル回収（TTL）と
  // 在室者 0 人の退出（Issue #79）の 2 つで、どちらもこの同じ関数を通る。
  destroyRoom = createRoomDestroyer({
    store,
    timers,
    scheduler,
    delegator,
    presence: presenceManager,
    releaseRoom: handlers.releaseRoom,
  });

  // httpHandler クロージャが reclaimer.reclaimedCount を参照するため、
  // wsAdapter 生成（クロージャ定義）より前に reclaimer を宣言する（TDZ 回避）。
  const reclaimer = new RoomReclaimer({
    store,
    idleTtlMs: config.roomIdleTtlMs,
    onReclaim: (code, idleMs) => {
      // 後始末は共通の破棄経路へ委ねる（二重に並べるとずれる）。
      destroyRoom(code);
      // 運用ログ（journalctl -u tasuki-sync | grep reclaimed で追える・R3-1）。
      // ルームコードは資格情報なので相関 ID へ置き換える（ADR 0012 D2）。
      logger.info("reclaimed", { room: refEncoder.room(code), idleMs });
    },
  });

  // レート制限の相関ソルト。**プロセス起動ごとに 1 度だけ生成し、env にも設定にも置かない**
  // （ADR 0012 D3）。再起動で鍵が変わるのは揮発インメモリ設計と整合するので受け入れる。
  const deriveClientKey = createClientKeyDeriver(randomBytes(32));

  // ── poker（見積もり文脈）の組み立て ─────────────────────────────────
  // **#95 S4a で名簿・復帰トークンが timer と 1 つになった**（`store` / `tokens`）。
  // poker だけのものは、ラウンドの保管（`rounds`）・単調時計・ID 生成・配信の 4 つである。
  //
  // ⚠ **この配線は単独で main へ入れてもデプロイしてもいけない。**
  // 名簿を 1 つにした一方で入口の門と寿命の一本化がまだ入っておらず、その間だけ
  // timer のルームコードを poker の入口へ与えると、次の 4 つが同時に成立する
  // （詳細は `poker/application/handlers.ts` の冒頭）。
  // **1 と 2 は 2026-09-10 に実機の WS で実測した。3 と 4 は経路をコードで確かめたもので、
  // 実機では再現していない。**
  //   1. 合言葉の検査（`command-handlers/room-join.ts` にしか無い）を**一度も通らずに**、
  //      timer の snapshot（お題・参加者・輪・時計・AI 状態）を poker のソケットで受信できる。
  //      **このファイルの `broadcaster`**（timer 側。上の `const broadcaster = {…}`。
  //      後から作る `pokerBroadcaster` ではない）の `broadcastSnapshot` が、
  //      共有名簿の `connId` から宛先を作るためである
  //   2. その接続が timer の名簿に幽霊の参加者として現れ、timer の画面に載る
  //   3. poker の即時破棄が `tokens.releaseRoom` を呼ぶので、
  //      **timer ルームの合言葉と全復帰トークンまで消える**
  //   4. その即時破棄は `createRoomDestroyer` を通らないので、scheduler / delegator /
  //      presence の予約が**消えたルームに対して発火し続け**、さらに poker が
  //      `TimerStore` を持たないため **timer の状態が孤児として残る**
  // 1・2 を塞ぐのは入口の門、3・4 を塞ぐのは即時破棄の撤去で、どちらもこの段の後に来る。
  // **門と寿命の一本化と同じ PR で着地させること。**
  const pokerClock = createPerformanceClock();
  const pokerIdGen = createCryptoIdGen();
  const pokerBroadcaster = createWsBroadcaster();
  /**
   * 入室失敗のレート制限（#103）。**数える単位は接続ではなくクライアント（IP の HMAC）**。
   * 接続単位だと再接続で窓がリセットされ、ルーム ID の総当たりを止められない。
   *
   * poker には合言葉が無く、`check-room` が存在確認そのものなので、
   * join と check は同じバケツを共有する。
   *
   * ⚠ **timer のバケツとは別インスタンスである**（timer 側は `makeHandlers` の
   * 内側で作られる）。#95 S2 まではこれで「統合前と同じ実効枠」だった —— 2 つの入口が
   * 別々のルームコード空間を見ていたので、1 つのコードを総当たりできる予算は
   * 入口ごとに 1 本ずつしか無かった（D22 の判断。根拠は `docs/adr/0004` の追記）。
   *
   * ⚠ **S4a でその前提が崩れた。据え置きではなく、現に緩んでいる。**
   * poker の `handleCheckRoom` / `handleJoinRoom` が共有名簿を引くようになったため、
   * **timer のルームコードの存在確認が poker の入口からもできる**。バケツは別のままなので、
   * 1 つの IP が 1 つのコード空間へ使える実効予算は**単純に 2 倍**になった。
   * #103 設計正本が「枠稼ぎを止めている」と数えた前提に直接効く。
   * 解消（限定器を 1 本にして両方へ注入する）は、入口の門と同じ段の仕事である。
   */
  const pokerRateLimiter = createTokenBucketLimiter({
    capacity: DEFAULT_CAPACITY,
    refillPerSec: DEFAULT_REFILL_PER_SEC,
  });
  const pokerHandlers = makePokerHandlers({
    store,
    rounds,
    tokens,
    broadcaster: pokerBroadcaster,
    idGen: pokerIdGen,
    clock: pokerClock,
    wallClock: clock,
    rateLimiter: pokerRateLimiter,
    maxRooms: config.maxRooms,
  });

  wsAdapter = new WsAdapter({
    port: config.port,
    host: config.host,
    allowedOrigins: config.allowedOrigins,
    maxConnections: config.maxConnections,
    maxMessageBytes: config.maxMessageBytes,
    maxFrameBytes: config.maxFrameBytes,
    poker: pokerHandlers,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatMaxMisses: config.heartbeatMaxMisses,
    logger,
    deriveClientKey,
    requireClientAddress: config.requireClientAddress,
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
    // 接続の受理時に、この接続が属するクライアント鍵（IP の HMAC）を登録する。
    // これが無いと鍵は connId へ落ち、接続単位の（＝再接続で回避できる）挙動に戻る。
    onConnect: (connId, rateKey) => {
      handlers.handleConnectionOpen(connId, rateKey);
    },
    onDisconnect: (connId) => {
      presenceManager.handleDisconnect(connId);
      // connId → クライアント鍵の対応を解放（マップのリーク防止）。
      // レート制限の残量はここでは戻らない（鍵はクライアントであって接続ではない）。
      handlers.handleConnectionClose(connId);
    },
    // 管理エンドポイント（/status・/admin/rooms）を WS サーバの HTTP 層に配線（R3-2）。
    httpHandler: (req) =>
      handleAdminHttp(req.method, req.path, req.headers, {
        adminToken: config.adminToken,
        getReport: () =>
          buildAdminReport(
            snapshotRooms(),
            reclaimer.reclaimedCount,
            aiLimiter ? { today: aiLimiter.todayCount, total: aiLimiter.totalCount } : undefined,
          ),
      }),
  });

  reclaimer.start(RECLAIM_SWEEP_MS);

  return {
    wsAdapter,
    store,
    timers,
    rounds,
    port: wsAdapter.port,
    aiReady,
    close: async () => {
      reclaimer.stop();
      scheduler.clearAll();
      delegator.cancelAll();
      // 不在猶予タイマー（ドライバー繰り上げ）も解放する。
      // 本番は直後に process.exit(0) するため観測できる差は無いが、
      // 同一プロセスでサーバーを何度も起動し直すテストでは、放置すると
      // 閉じたはずのサーバーのタイマーが後から発火してしまう。
      presenceManager.clearAllTimers();
      await wsAdapter.close();
    },
  };
}
