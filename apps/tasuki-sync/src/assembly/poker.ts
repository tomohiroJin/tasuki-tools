/**
 * poker（`?tool=poker`）の組み立て（#95 S4a。#591 で `create-sync-server.ts` から分けた。中身は変えていない）。
 *
 * **#95 S4a で名簿・復帰トークン・レート制限のバケツ・入口の門が timer と 1 つになった。**
 * poker だけのものは、ラウンドの保管・単調時計・ID 生成・配信・隠しモードの猶予の予約である。
 */
import { createPerformanceClock } from "../adapters/performance-clock.js";
import { createCryptoIdGen } from "../adapters/poker-crypto-id-gen.js";
import { InMemoryRoundStore } from "../adapters/poker-in-memory-round-store.js";
import { createWsBroadcaster } from "../adapters/poker-ws-broadcaster.js";
import { makePokerHandlers, type PokerHandlers } from "../application/poker-handlers.js";
import { Scheduler } from "../application/schedule.js";
import type { TopicBroadcaster } from "../application/topic-broadcast.js";
import type { AssemblyBase, TimerSide, ToolPartBase } from "./context.js";

export interface PokerPart extends ToolPartBase {
  /** WS アダプタへ渡すメッセージ層（poker は接続そのものを受ける）。 */
  readonly layer: PokerHandlers;
  /** 投票ラウンドの保管。名簿とはルームコードで対になる。 */
  readonly rounds: InMemoryRoundStore;
  /** 破棄の共通経路へ渡す分（寿命はツールごとではなくルームごと・#95 S4a）。 */
  readonly destroy: { readonly rounds: InMemoryRoundStore };
}

/** poker のメッセージ層。お題の配信（参加した本人へ 1 通・#91）は受け取る。 */
export function assemblePoker(base: AssemblyBase, timer: TimerSide, topicBroadcaster: TopicBroadcaster): PokerPart {
  const { config, store, timers, tokens, clock, random, rateLimiter } = base;
  const rounds = new InMemoryRoundStore();
  // 隠しモードの切断の猶予が切れる時刻の予約（#403 G-8）。timer の `scheduler` とは別のインスタンス
  const gameTimer = new Scheduler(clock);
  const layer = makePokerHandlers({
    store,
    timers,
    timerBroadcaster: base.timerBroadcaster,
    rounds,
    tokens,
    hub: base.hubBroadcaster,
    broadcaster: createWsBroadcaster(),
    idGen: createCryptoIdGen(),
    clock: createPerformanceClock(),
    wallClock: clock,
    rateLimiter,
    // 隠しモードの山を切る（#403）。timer のシャッフル・ルーレットと同じ乱数源
    random,
    gameTimer,
    maxRooms: config.maxRooms,
    // お題の状態を参加した本人へ 1 通送る（#91・E4）。配信先はルームの全接続。
    topicBroadcaster,
    // 人をルームから外す（#419）。
    removeFromRoom: timer.removeFromRoom,
  });
  return { layer, rounds, destroy: { rounds }, close: () => gameTimer.clearAll() };
}
