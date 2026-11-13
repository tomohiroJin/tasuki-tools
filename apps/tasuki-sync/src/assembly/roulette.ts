/**
 * ルーレット（`?tool=roulette`）の組み立て（#94。#591 で `create-sync-server.ts` から分けた。中身は変えていない）。
 *
 * 状態は**ルームに属する**ので、名簿とはルームコードで対になる（破棄は `destroy-room.ts` が揃えて行う）。
 */
import { createCryptoRandomSource } from "../adapters/crypto-random-source.js";
import { InMemoryRouletteStore } from "../adapters/in-memory-roulette-store.js";
import { createPerformanceClock } from "../adapters/performance-clock.js";
import { makeRouletteBroadcaster } from "../application/roulette-broadcast.js";
import { makeRouletteHandlers, type RouletteHandlers } from "../application/roulette-handlers.js";
import type { AssemblyBase, TimerSide, ToolPartBase } from "./context.js";

export interface RoulettePart extends ToolPartBase {
  /** WS アダプタへ渡すメッセージ層。 */
  readonly layer: RouletteHandlers;
  /** 破棄の共通経路へ渡す分。 */
  readonly destroy: { readonly roulettes: InMemoryRouletteStore };
}

/**
 * ルーレットのメッセージ層と配信（#94）。
 *
 * **参加の守りはお題と同じく `join-room.ts` を通し、レート制限のゲートも {@link TimerSide.rateLimitGate}
 * を渡す。新しく作らない**（別に作ると `connId → クライアント鍵` の対応が空になり、
 * 参加の総当たりが張り直すだけで枠を回避できる）。ルーレットの接続も `onConnect` を通る
 * （`ws-adapter.ts`）ので、同じゲートなら鍵が登録済みである。
 * 配信の宛先はルーレットの接続だけ（`roulette-broadcast.ts`）。**時計は単調時計**（`elapsedMs` を計る）。
 */
export function assembleRoulette(base: AssemblyBase, timer: TimerSide): RoulettePart {
  const { store, timers, clock, codeGen, tokens, logger, ws } = base;
  const roulettes = new InMemoryRouletteStore();
  const rouletteClock = createPerformanceClock();
  const broadcaster = makeRouletteBroadcaster({
    store,
    roulettes,
    clock: rouletteClock,
    send: (connIds, msg) => ws.get().broadcastRoulette(connIds, msg),
  });
  const layer = makeRouletteHandlers({
    store,
    timerBroadcaster: base.timerBroadcaster,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: timer.rateLimitGate,
    hub: base.hubBroadcaster,
    roulettes,
    broadcaster,
    send: (connId, msg) => ws.get().sendRoulette(connId, msg),
    monotonicClock: rouletteClock,
    random: createCryptoRandomSource(),
    logger,
  });
  return { layer, destroy: { roulettes } };
}
