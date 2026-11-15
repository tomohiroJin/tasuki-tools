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
 * 道具ごとの組み立て（ストア・配信・ハンドラ・猶予・破棄）は `assembly/` の道具ごとの関数にあり（#591）、
 * この関数は共有の部品を作って**道具の表を畳む**（メッセージ層を WS アダプタへ渡し、破棄・止める処理・
 * 名簿配信の契機を表から集める）。順序と前方参照は `assembly/context.ts` の docstring に書いてある
 * （共有の部品 → お題の保管 → timer のハンドラ → 各道具のメッセージ層の順。循環は名前つきの前方参照 `late` で解く）。
 *
 * ⚠ **本番（`server.ts`）とテストが必ずこの関数を通ることが要点である。**
 * テスト側で同じ組み立てを書き写すと、写しが本番からずれた瞬間に
 * 「配線が繋がっているか」の検査が死ぬ（テストは緑のまま本番だけ壊れる）。
 * Issue #80 が塞ぎたい穴はまさにそこなので、組み立ての知識は、このファイルと、これが呼ぶ `assembly/` の道具ごとの組み立てだけが持つ
 * （WS アダプタを起こすのも、道具の表を畳むのもこのファイルだけである）。
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
import { InMemoryRoomStore } from "./adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "./adapters/in-memory-timer-store.js";
import { createCryptoRandomSource } from "./adapters/crypto-random-source.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
import { createPerformanceClock } from "./adapters/performance-clock.js";
import { createTimerWsBroadcaster } from "./adapters/timer-ws-broadcaster.js";
import { NanoidCodeGen } from "./adapters/nanoid-code-gen.js";
import { SystemWallClock } from "./adapters/system-clock.js";
import { WsAdapter } from "./adapters/ws-adapter.js";
import { buildAdminReport, handleAdminHttp } from "./application/admin.js";
import { createRoomDestroyer } from "./application/destroy-room.js";
import { makeHandlers } from "./application/handlers.js";
import { createLogger } from "./application/log/logger.js";
import { createRefEncoder } from "./application/log/ref-encoder.js";
import { PresenceManager } from "./application/presence.js";
import { RoomReclaimer } from "./application/room-reclaimer.js";
import { Scheduler } from "./application/schedule.js";
import { createTimerCommandReceiver } from "./application/timer-command-receiver.js";
import { createTokenStore } from "./application/token-store.js";
import type { KnownToolId } from "./application/tool-id.js";
import type { RoomDestroyerDeps } from "./application/destroy-room.js";
import type { InMemoryRoundStore } from "./adapters/poker-in-memory-round-store.js";
import type { AssertNever } from "./adapters/ws/raw-tools.js";
import { assembleAgenda, type AgendaPart } from "./assembly/agenda.js";
import { assembleCheckin, type CheckinPart } from "./assembly/checkin.js";
import { late, mergeDisjoint, type AssemblyBase, type TimerSide } from "./assembly/context.js";
import { assembleHub } from "./assembly/hub.js";
import { assemblePoker, type PokerPart } from "./assembly/poker.js";
import { assembleRoulette, type RoulettePart } from "./assembly/roulette.js";
import { assembleTopic, createAiBudget, createTopicResources, type TopicPart } from "./assembly/topic.js";
import type { SyncConfig } from "./config.js";

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

/**
 * 道具ごとの組み立ての表（具体の部品の型で持つ。poker の層もここから引くので、別の前方参照は要らない）。
 * **鍵は道具の一覧（`application/tool-id.ts` の `TOOL_IDS`）から timer を除いた全部**（timer は `makeHandlers` が持つので表の外）。
 * 道具を足して表へ足し忘れる（{@link ToolPartsCoverTools}）、一覧に無い鍵を足す（{@link NoExtraToolParts}）と、型検査が落ちる。
 */
interface ToolParts {
  readonly topic: TopicPart;
  readonly roulette: RoulettePart;
  readonly agenda: AgendaPart;
  readonly checkin: CheckinPart;
  readonly poker: PokerPart;
}
export type ToolPartsCoverTools = AssertNever<Exclude<Exclude<KnownToolId, "timer">, keyof ToolParts>>;
export type NoExtraToolParts = AssertNever<Exclude<keyof ToolParts, Exclude<KnownToolId, "timer">>>;

/** 設定から同期サーバー一式を組み立てて起動する。 */
export function createSyncServer(config: SyncConfig): SyncServer {
  // ── 1. 共有の部品 ──────────────────────────────────────────────────
  const store = new InMemoryRoomStore();
  const timers = new InMemoryTimerStore();
  // ログの出口はここで 1 本に決める（ADR 0012 D1）。
  // ソルトはプロセス起動ごと。再起動で相関が切れるのは揮発設計と整合する（D2）。
  const logger = createLogger(consoleLogSink);
  const refEncoder = createRefEncoder(randomBytes(32));
  const clock = new SystemWallClock();
  // 単調時計は 1 つを共有する（進行タイマーの予約とハンドラが同じ時計で測る）。
  const monotonicClock = createPerformanceClock();
  const scheduler = new Scheduler(clock);

  /**
   * 入室失敗のレート制限のバケツ（#103）。**全道具で 1 本を共有する**（#95 S4a）。
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
   * **入室と合言葉の照合を行う経路は、入口をまたいですべてこれを消費する**（経路の一覧はここに書かない ——
   * 入口を足すたびに腐る）。
   */
  const rateLimiter = createTokenBucketLimiter({
    capacity: DEFAULT_CAPACITY,
    refillPerSec: DEFAULT_REFILL_PER_SEC,
  });

  // 前方参照（組み立ての循環）。値を入れる前に引くと名前つきで落ちる（`assembly/context.ts`）。
  const ws = late<WsAdapter>("wsAdapter");
  const destroyRoom = late<(roomCode: string) => void>("destroyRoom");
  const toolParts = late<ToolParts>("toolParts");

  // timer とハブの配信（宛先の選び方を含む）は `adapters/timer-ws-broadcaster.ts`（#367 で組み立てから出した）。
  const { broadcaster, hubBroadcaster } = createTimerWsBroadcaster({
    store,
    ws: () => ws.get(),
    // 名簿が変わったら各道具が測り直す（チェックインが席と自動開票を。#406）。表は下で決まる。
    onRosterBroadcast: (roomCode) => {
      for (const part of Object.values(toolParts.get())) part.onRosterBroadcast?.(roomCode);
    },
  });

  const base: AssemblyBase = {
    config,
    store,
    timers,
    // 復帰トークンとパスフレーズの保管。**全道具で 1 個を共有する**（#95 S4a）。別々に持つと
    // `destroyRoom` / `releaseRoom` が片方しか解放せず、ルームを消してももう片方のトークンが残る。
    tokens: createTokenStore(),
    clock,
    monotonicClock,
    // レート制限の時刻を読む単調時計と、member.shuffle の乱数（#367）。
    random: createCryptoRandomSource(),
    codeGen: new NanoidCodeGen(),
    logger,
    refEncoder,
    rateLimiter,
    timerBroadcaster: broadcaster,
    hubBroadcaster,
    ws,
  };

  // ── 2. お題の保管と配信（timer のハンドラが先に要る） ────────────────────
  const ai = createAiBudget(base);
  const topicResources = createTopicResources(base, ai);

  // ── 3. timer のハンドラ ─────────────────────────────────────────────
  const handlers = makeHandlers({
    store,
    monotonicClock,
    random: base.random,
    timers,
    tokens: base.tokens,
    hub: hubBroadcaster,
    rateLimiter,
    clock,
    broadcaster,
    codeGen: base.codeGen,
    scheduler,
    maxRooms: config.maxRooms,
    destroyRoom: (roomCode) => destroyRoom.get()(roomCode),
    // **退出した人の票を捨てる**（R8・#95 S5b）。timer の文脈は poker の保管を知らないので、
    // ここで繋ぐ。poker の層は下で組み立てるが、呼ばれるのは要求が届いてからである。
    discardPokerVote: (roomCode, participantId) =>
      toolParts.get().poker.layer.handleParticipantRemoved(roomCode, participantId),
    // お題の状態を参加・作成した本人へ 1 通送る（#91・E4）。配信先はルームの全接続。
    topicBroadcaster: topicResources.broadcaster,
    // 完成記録にお題のタイトルを写すために読む（#91・spec T9）。お題の配信・破棄と同じ 1 個。
    topics: topicResources.topics,
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

  // ── 4. 各道具のメッセージ層（timer のゲートを受ける） ─────────────────────
  /**
   * **ゲートは `makeHandlers` が 1 度だけ包んだものを、全道具で共有する。新しく作らない**
   * （別に作ると `connId → クライアント鍵` の対応が空になり、鍵が connId へ落ちて、
   * 参加の総当たりが張り直すだけで枠を回避できる）。
   */
  const timerSide: TimerSide = {
    rateLimitGate: handlers.rateLimitGate,
    removeFromRoom: handlers.removeFromRoom,
  };
  const hub = assembleHub(base, timerSide, topicResources.broadcaster);
  const topic = assembleTopic(base, timerSide, topicResources, ai);
  const roulette = assembleRoulette(base, timerSide);
  const agenda = assembleAgenda(base, timerSide);
  const checkin = assembleCheckin(base, timerSide);
  const poker = assemblePoker(base, timerSide, topicResources.broadcaster);
  const parts: ToolParts = { topic, roulette, agenda, checkin, poker };
  toolParts.set(parts);

  // 後始末を契機ごとに並べ直すと片方だけが更新されて必ずずれるため、内容と順序は
  // `destroy-room.ts` の 1 箇所にしか持たない。契機はアイドル回収（TTL）と
  // 在室者 0 人の退出（Issue #79）の 2 つで、どちらもこの同じ関数を通る。
  // 各道具の保管は、道具ごとの組み立てが `destroy` として返したものを並べる
  // （必須の鍵が 1 つでも欠ければ型検査が落ちる。寿命はツールごとではなくルームごとに 1 つ・#95 S4a）。
  // 各部品の `destroy` は鍵が重なれば落ちる（後勝ちで黙って外れない）。受け側に無い余計な鍵は、型が `never` を要求して落とす。
  const toolDestroy = mergeDisjoint(topic.destroy, roulette.destroy, agenda.destroy, checkin.destroy, poker.destroy);
  const destroyDeps: RoomDestroyerDeps & Record<Exclude<keyof typeof toolDestroy, keyof RoomDestroyerDeps>, never> = {
    store,
    timers,
    ...toolDestroy,
    scheduler,
    presence: presenceManager,
    releaseRoom: handlers.releaseRoom,
  };
  destroyRoom.set(createRoomDestroyer(destroyDeps));

  // httpHandler クロージャが reclaimer.reclaimedCount を参照するため、
  // WS アダプタ生成（クロージャ定義）より前に reclaimer を宣言する。
  const reclaimer = new RoomReclaimer({
    store,
    clock,
    idleTtlMs: config.roomIdleTtlMs,
    onReclaim: (code, idleMs) => {
      // 後始末は共通の破棄経路へ委ねる（二重に並べるとずれる）。
      destroyRoom.get()(code);
      // 運用ログ（journalctl -u tasuki-sync | grep reclaimed で追える・R3-1）。
      // ルームコードは資格情報なので相関 ID へ置き換える（ADR 0012 D2）。
      logger.info("reclaimed", { room: refEncoder.room(code), idleMs });
    },
  });

  // レート制限の相関ソルト。**プロセス起動ごとに 1 度だけ生成し、env にも設定にも置かない**
  // （ADR 0012 D3）。再起動で鍵が変わるのは揮発インメモリ設計と整合するので受け入れる。
  const deriveClientKey = createClientKeyDeriver(randomBytes(32));

  const wsAdapter = new WsAdapter({
    port: config.port,
    host: config.host,
    allowedOrigins: config.allowedOrigins,
    maxConnections: config.maxConnections,
    maxMessageBytes: config.maxMessageBytes,
    maxFrameBytes: config.maxFrameBytes,
    poker: poker.layer,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatMaxMisses: config.heartbeatMaxMisses,
    logger,
    deriveClientKey,
    requireClientAddress: config.requireClientAddress,
    // 生テキストを受けるツールのメッセージ層（鍵は `adapters/ws/raw-tools.ts` の表）。
    raw: { hub, topic: topic.layer, roulette: roulette.layer, agenda: agenda.layer, checkin: checkin.layer },
    // cmd は ws-adapter 側で CommandSchema（valibot）に通した検証済みの値で、型も Command のまま届く（#363）。
    // 表示名の正規化は受け口のアプリケーション側が掛ける（#368）。
    timer: createTimerCommandReceiver({
      reply: (connId, msg) => ws.get().send(connId, msg),
      route: async (connId, cmd) => {
        if (cmd.command === "presence.ping") {
          presenceManager.handlePing(connId);
          return;
        }

        await handlers.handleCommand(connId, cmd);
      },
    }),
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
            ai.aiLimiter ? { today: ai.aiLimiter.todayCount, total: ai.aiLimiter.totalCount } : undefined,
          ),
      }),
  });
  ws.set(wsAdapter);

  reclaimer.start(RECLAIM_SWEEP_MS);

  return {
    wsAdapter,
    store,
    timers,
    rounds: poker.rounds,
    port: wsAdapter.port,
    aiReady: ai.aiReady,
    close: async () => {
      reclaimer.stop();
      scheduler.clearAll();
      // 各道具の後始末（予約・猶予・子プロセスの解放）。お題の生成も止める（子プロセスを残さない・#91）。
      for (const part of Object.values(parts)) part.close?.();
      // 不在猶予タイマー（ドライバー繰り上げ）も解放する。
      // 本番は直後に process.exit(0) するため観測できる差は無いが、
      // 同一プロセスでサーバーを何度も起動し直すテストでは、放置すると
      // 閉じたはずのサーバーのタイマーが後から発火してしまう。
      presenceManager.clearAllTimers();
      await wsAdapter.close();
    },
  };
}
