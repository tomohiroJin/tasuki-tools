/**
 * 同期サーバーの配線（組み立て）を 1 箇所に閉じ込めた関数。
 *
 * **#95 S2 で timer と poker の 2 本を 1 プロセスへ統合した**（設計正本 D9）。
 * 旧 `apps/poker-sync/src/create-sync-server.ts` の組み立てはこの関数の後半にある。
 *
 * **#95 S4a で共有するものが増えた。** いま 2 つの文脈が共有するのは、接続層
 * （`WsAdapter`）・**名簿（`RoomStore`）**・**復帰トークン（`TokenStore`）**・
 * **入室失敗のレート制限のバケツ**の 4 つである（**#95 S5b で入口の門が廃止され 1 つ減った**）。
 * 後ろの 2 つは名簿を 1 つにした帰結で、どちらも**ルームコードの空間が 1 つになった**
 * ことに由来する（総当たりの予算は、コード空間ごとに 1 つでなければ意味を失う）。
 * どの入口から入れるかの判定も同じ理由で 1 つだが、こちらは配線を持たない ——
 * 合言葉の関門（`application/room-entry.ts`）はトークン保管を見るだけの関数である。
 * ツールの状態（`TimerStore` / `RoundStore`）・時計・ID 生成・配信はそれぞれ別のまま
 * であり、単一の巨大ストアにはしない（設計正本 §5.5 / D16）。
 *
 * store / clock / codeGen / scheduler / broadcaster / handlers /
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
import { connectionsIn } from "@tasuki/room-core";
import type { HubServerMsg } from "@tasuki/room-core";
import { buildRoster } from "./application/roster-dto.js";
import { makeHubHandlers } from "./application/hub-handlers.js";
import { makeTopicBroadcaster } from "./application/topic-broadcast.js";
import { makeTopicHandlers } from "./application/topic-handlers.js";
import { TopicGenerator } from "./application/topic-generation.js";
import { InMemoryTopicStore } from "./adapters/in-memory-topic-store.js";
import { ClaudeCliTopicProvider } from "./adapters/claude-cli-topic-provider.js";
import type { HubBroadcaster } from "./ports/hub-broadcaster.js";
import { makeHandlers } from "./application/handlers.js";
import { TOOL_TIMER } from "./application/tool-id.js";
import { PresenceManager } from "./application/presence.js";
import { Scheduler } from "./application/schedule.js";
import { WsAdapter } from "./adapters/ws-adapter.js";
import { InMemoryRoomStore } from "./adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "./adapters/in-memory-timer-store.js";
import { SystemClock } from "./adapters/system-clock.js";
import { NanoidCodeGen } from "./adapters/nanoid-code-gen.js";
import { RoomReclaimer } from "./application/room-reclaimer.js";
import { createRoomDestroyer } from "./application/destroy-room.js";
import { buildAdminReport, handleAdminHttp } from "./application/admin.js";
import { AiLimiter } from "./application/ai-limits.js";
import { createLogger } from "./application/log/logger.js";
import { createTokenStore } from "./application/token-store.js";
import { createRefEncoder } from "./application/log/ref-encoder.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
import { InMemoryRoundStore } from "./adapters/poker-in-memory-round-store.js";
import { createPerformanceClock } from "./adapters/poker-performance-clock.js";
import { createCryptoIdGen } from "./adapters/poker-crypto-id-gen.js";
import { createWsBroadcaster } from "./adapters/poker-ws-broadcaster.js";
import { makeHandlers as makePokerHandlers } from "./application/poker-handlers.js";
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
  /**
   * お題の状態の保管（#91）。**ツールではなくルームに属する**ので、timer・poker の保管とは
   * 別に 1 つ持ち、名簿とはルームコードで対になる（破棄は `destroy-room.ts` が揃えて行う）。
   */
  const topics = new InMemoryTopicStore();
  const clock = new SystemClock();
  /**
   * 復帰トークンとパスフレーズの保管。**timer と poker で 1 個を共有する**（#95 S4a）。
   *
   * poker の復帰トークンが `Participant.token` から `token-store` へ寄ったため、
   * 別々に持つと `destroyRoom` / `releaseRoom` が片方しか解放しない
   * （名簿は 1 つなのに、ルームを消してももう片方のトークンが残る）。
   */
  const tokens = createTokenStore();

  const codeGen = new NanoidCodeGen();
  const scheduler = new Scheduler(clock);

  // ログの出口はここで 1 本に決める（ADR 0012 D1）。
  // ソルトはプロセス起動ごと。再起動で相関が切れるのは揮発設計と整合する（D2）。
  const logger = createLogger(consoleLogSink);
  const refEncoder = createRefEncoder(randomBytes(32));

  /** Broadcaster 実装（WS アダプタへの橋渡し） */
  let wsAdapter: WsAdapter;

  /**
   * 配信先は**名簿（`store`）を引いて、timer に在席している接続だけ**へ絞る
   * （#95 S4b・D4・`connectionsIn`）。
   *
   * ⚠ **宛先は「呼び出し時点のストア」から決まる。** 2 つの帰結がある ——
   *
   * 1. **保管より先に配信すると、宛先が 1 つ前の名簿になる。** `commit`（`handlers.ts`）と
   *    `presence.ts` はどちらも put のあとに配信する。この順序に依存している例が
   *    `participant-remove.ts` にあり、退出させた本人へ全体配信が届かないことを
   *    この順序で担保している（本人向けは専用の `sendTo`）
   * 2. **S4a まで `broadcastSnapshot` は引数の wire から `connId` を拾っていた。**
   *    多接続では wire に接続 1 本を載せられないので、名簿を引く `broadcastSignal` と
   *    同じ形へ揃えた（wire から `connId` が消えるのはこの帰結である）
   */
  const recipientsOf = (roomCode: string): string[] => {
    const room = store.get(roomCode);
    return room ? connectionsIn(room, TOOL_TIMER) : [];
  };

  /**
   * ハブ（選択画面）の配信先（#95 S5a）。**ツールを宣言していない接続**である。
   *
   * timer 側（{@link recipientsOf}）と同じく、宛先は**呼び出し時点のストア**から決まる。
   * 中身（名簿）も同じ時点から引くので、保管より先に配信して 1 つ前の名簿を配る事故は
   * `saveRoster`（保管と配信を対にする）と合わせて塞いである。
   */
  const hubRecipientsOf = (roomCode: string): string[] => {
    const room = store.get(roomCode);
    return room ? connectionsIn(room, null) : [];
  };

  const hubBroadcaster: HubBroadcaster = {
    sendTo(connId: string, msg: HubServerMsg): void {
      wsAdapter.sendHub(connId, msg);
    },
    broadcastRoster(roomCode: string): void {
      const room = store.get(roomCode);
      if (!room) return;
      wsAdapter.broadcastHub(hubRecipientsOf(roomCode), {
        type: "roster",
        room: buildRoster(room),
      });
    },
  };

  const broadcaster = {
    broadcastSnapshot(roomCode: string, room: Room): void {
      wsAdapter.broadcast(recipientsOf(roomCode), { type: "snapshot", room });
    },
    sendTo(connId: string, msg: ServerMsg): void {
      wsAdapter.send(connId, msg);
    },
    broadcastSignal(roomCode: string, msg: ServerMsg): void {
      wsAdapter.broadcast(recipientsOf(roomCode), msg);
    },
  };

  // AI お題生成（トークンと合言葉が両方あるときだけ有効。spec 2026-06-12 参照）
  const aiReady = Boolean(config.claudeOauthToken && config.aiUnlockKey);
  const aiLimiter = aiReady
    ? new AiLimiter({ clock, dailyLimit: config.aiDailyLimit })
    : undefined;

  /**
   * お題の状態の配信（#91）。**ツールごとの broadcaster の外に 1 つ置く**（spec §5.3 の T3）。
   * 宛先の選別（ルームの全接続 —— お題・ハブ・timer・poker）は `topic-broadcast.ts` が持つ。
   * `wsAdapter` は下で代入する（上の broadcaster と同じ前方参照）。
   */
  const topicBroadcaster = makeTopicBroadcaster({
    store,
    topics,
    send: (connIds, msg) => wsAdapter.broadcastTopic(connIds, msg),
  });

  /**
   * お題の生成（#91）。AI が使えるとき（`aiReady`）だけ provider を渡す。
   *
   * ⚠ **`aiLimiter` はサーバー全体で 1 つの予算である**（上で 1 個だけ作る）。日次上限と
   * 同時実行数を AI を使う箇所ごとに作ると、その分だけ予算が黙って増える。
   */
  const topicGenerator = new TopicGenerator({
    topics,
    clock,
    publish: (roomCode) => topicBroadcaster.publish(roomCode),
    provider: aiReady
      ? new ClaudeCliTopicProvider({
          token: config.claudeOauthToken!,
          model: config.aiProblemModel,
        })
      : undefined,
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

  /**
   * 入室失敗のレート制限のバケツ（#103）。**timer と poker で 1 本を共有する**（#95 S4a）。
   *
   * 数える単位は接続ではなくクライアント（IP の HMAC）である。接続単位だと再接続で
   * 窓がリセットされ、ルームコードの総当たりを止められない。
   *
   * **1 本にする理由は、名簿を 1 つにしてコード空間が 1 つになったからである。**
   * S2 までは入口ごとに別バケツで実効枠が保たれていた —— 2 つの入口が別々のコード空間を
   * 見ていたので、1 つのコードを総当たりできる予算は入口ごとに 1 本ずつしか無かった。
   * S4a で poker の入口からも timer のルームコードを試せるようになり、別のままなら
   * 1 IP あたりの実効予算が単純に 2 倍になる（ADR 0004 の追記・#103 設計正本 D22）。
   *
   * **入室と合言葉の照合を行う経路は、入口をまたいですべてこれを消費する**（timer・poker・
   * ハブ・お題（#91）の各入口。経路の一覧はここに書かない —— 入口を足すたびに腐る）。
   */
  const rateLimiter = createTokenBucketLimiter({
    capacity: DEFAULT_CAPACITY,
    refillPerSec: DEFAULT_REFILL_PER_SEC,
  });

  // ⚠ かつてここに**入口ごとの門**（`application/tool-gate.ts`）を組み立てる節があった。
  // **#95 S5b で廃止した** —— ツール状態を遅延生成にした（D8）ので「そのツールの状態が
  // あるか」は参加の可否を意味しなくなり、越境を止めるのは合言葉の関門
  // （`application/room-entry.ts`）になった。関門は配線を要らない（トークン保管を見るだけ）。

  const handlers = makeHandlers({
    store,
    timers,
    tokens,
    hub: hubBroadcaster,
    rateLimiter,
    clock,
    broadcaster,
    codeGen,
    scheduler,
    maxRooms: config.maxRooms,
    destroyRoom: (roomCode) => destroyRoom(roomCode),
    // **退出した人の票を捨てる**（R8・#95 S5b）。timer の文脈は poker の保管を知らないので、
    // ここで繋ぐ。`pokerHandlers` はこの下で組み立てるが、呼ばれるのは要求が届いてからである。
    discardPokerVote: (roomCode, participantId) =>
      pokerHandlers.handleParticipantRemoved(roomCode, participantId),
    // お題の状態を参加・作成した本人へ 1 通送る（#91・E4）。配信先はルームの全接続。
    topicBroadcaster,
    // 完成記録にお題のタイトルを写すために読む（#91・spec T9）。お題の配信・破棄と同じ 1 個。
    topics,
  });
  const presenceManager = new PresenceManager({
    store,
    timers,
    broadcaster,
    hub: hubBroadcaster,
    clock,
    // ドライバー不在の猶予後繰り上げ（R2-1）。handlers のスケジューラ経由で交代＋タイマー再アンカー。
    onDriverAbsence: handlers.advanceForAbsence,
  });

  // 後始末を契機ごとに並べ直すと片方だけが更新されて必ずずれるため、内容と順序は
  // `destroy-room.ts` の 1 箇所にしか持たない。契機はアイドル回収（TTL）と
  // 在室者 0 人の退出（Issue #79）の 2 つで、どちらもこの同じ関数を通る。
  //
  // **#95 S4a で `rounds`（poker のラウンド）もここが解放するようになった。**
  // 寿命はツールごとではなくルームごとに 1 つなので、poker 側に別の破棄経路は無い
  // （旧 `application/poker-handlers.ts` の即時破棄は撤去した・R10・D8）。
  destroyRoom = createRoomDestroyer({
    store,
    timers,
    rounds,
    // **#91 でお題の状態と生成もここが解放・中断する**（寿命はルームごとに 1 つ）。
    topics,
    scheduler,
    topicGenerator,
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
  // **#95 S4a で名簿・復帰トークン・レート制限のバケツ・入口の門が timer と 1 つになった。**
  // poker だけのものは、ラウンドの保管（`rounds`）・単調時計・ID 生成・配信の 4 つである。
  const pokerClock = createPerformanceClock();
  const pokerIdGen = createCryptoIdGen();
  const pokerBroadcaster = createWsBroadcaster();
  const pokerHandlers = makePokerHandlers({
    store,
    rounds,
    tokens,
    hub: hubBroadcaster,
    broadcaster: pokerBroadcaster,
    idGen: pokerIdGen,
    clock: pokerClock,
    wallClock: clock,
    rateLimiter,
    maxRooms: config.maxRooms,
    // お題の状態を参加した本人へ 1 通送る（#91・E4）。配信先はルームの全接続。
    topicBroadcaster,
  });

  /**
   * ハブ（選択画面）のメッセージ層（#95 S5a）。
   *
   * **守り（レート制限・合言葉の関門・復帰）は timer と共有する** ——
   * `join-room.ts` / `create-room.ts` を timer の入口と同じ引数で呼ぶ。
   * **レート制限のゲートも同じインスタンスを渡す** —— 別に作ると `connId → 鍵` の
   * 対応が空になり、`/ws` は再接続で回避できる抜け道になる。
   */
  const hubHandlers = makeHubHandlers({
    store,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: handlers.rateLimitGate,
    maxRooms: config.maxRooms,
    hub: hubBroadcaster,
    // 作成・参加の成功時に、いまのお題を本人へ 1 通送る（#91・E4）。
    topicBroadcaster,
  });

  /**
   * お題ツール（`?tool=topic`）のメッセージ層（#91）。
   *
   * **参加の守り（レート制限・合言葉の関門・復帰）はハブと同じく `join-room.ts` を通す。**
   * **レート制限のゲートも `handlers.rateLimitGate` を渡す。新しく作らない** ——
   * 別に作ると `connId → クライアント鍵` の対応が空になり、鍵が connId へ落ちる。
   * そうなると `ai.unlock` の総当たりが**張り直すだけで**枠を回避でき、`room.join` とも
   * 別の枠になる（`handlers.ts` の「★取り違えないこと」）。お題の接続も `onConnect` を
   * 通るので（`ws-adapter.ts`）、同じゲートなら鍵が登録済みである。
   */
  const topicHandlers = makeTopicHandlers({
    store,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: handlers.rateLimitGate,
    hub: hubBroadcaster,
    topics,
    generator: topicGenerator,
    broadcaster: topicBroadcaster,
    send: (connId, msg) => wsAdapter.sendTopic(connId, msg),
    // トークン未設定なら合言葉も渡さない＝解錠は常に失敗（存在秘匿）
    aiUnlockKey: aiReady ? config.aiUnlockKey : undefined,
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
    onHubMessage: async (connId, raw) => {
      await hubHandlers.handleMessage(connId, raw);
    },
    onTopicMessage: async (connId, raw) => {
      await topicHandlers.handleMessage(connId, raw);
    },
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
        // 「利用者から見えているルーム」は名簿が正本（#95 S4a）。timer の状態を持たない
        // ルーム（poker だけのルームなど）も名簿には載るので、活動中の枠として数える。
        getReport: () =>
          buildAdminReport(
            store.list(),
            new Map(timers.list().map((t) => [t.code, t])),
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
      // お題の生成も止める（子プロセスを残さない。#91）。
      topicGenerator.cancelAll();
      // 不在猶予タイマー（ドライバー繰り上げ）も解放する。
      // 本番は直後に process.exit(0) するため観測できる差は無いが、
      // 同一プロセスでサーバーを何度も起動し直すテストでは、放置すると
      // 閉じたはずのサーバーのタイマーが後から発火してしまう。
      presenceManager.clearAllTimers();
      await wsAdapter.close();
    },
  };
}
