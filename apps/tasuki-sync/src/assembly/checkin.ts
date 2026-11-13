/**
 * チェックイン（`?tool=checkin`）の組み立て（#406。#591 で `create-sync-server.ts` から分けた。中身は変えていない）。
 */
import { InMemoryCheckinStore } from "../adapters/in-memory-checkin-store.js";
import { makeCheckinBroadcaster } from "../application/checkin-broadcast.js";
import { makeCheckinHandlers, type CheckinHandlers } from "../application/checkin-handlers.js";
import type { CheckinServerMsg } from "../ports/checkin-server-msg.js";
import type { AssemblyBase, TimerSide, ToolPartBase } from "./context.js";

export interface CheckinPart extends ToolPartBase {
  /** WS アダプタへ渡すメッセージ層。 */
  readonly layer: CheckinHandlers;
  /** 破棄の共通経路へ渡す分（猶予のタイマーはハンドラが持つ）。 */
  readonly destroy: {
    readonly checkins: InMemoryCheckinStore;
    readonly checkinGrace: { clearRoom(roomCode: string): void };
  };
}

/**
 * チェックインのメッセージ層と配信（#406）。
 *
 * **参加の守りはルーレットと同じく `join-room.ts` を通し、レート制限のゲートも {@link TimerSide.rateLimitGate}
 * を渡す。新しく作らない**。配信は受け手ごとに中身が違う投影で、接続 1 本ずつへ送る。
 *
 * 名簿が配られるたびに（{@link ToolPartBase.onRosterBroadcast}）席と自動開票を測り直し、
 * 止めるとき・破棄のときに切断による自動公開の猶予（ADR 0028）を解放する。
 */
export function assembleCheckin(base: AssemblyBase, timer: TimerSide): CheckinPart {
  const { config, store, timers, clock, codeGen, tokens, monotonicClock, random, ws } = base;
  const checkins = new InMemoryCheckinStore();
  const send = (connId: string, msg: CheckinServerMsg): void => ws.get().to.checkin.send(connId, msg);
  const broadcaster = makeCheckinBroadcaster({ store, checkins, send });
  const layer = makeCheckinHandlers({
    store,
    timerBroadcaster: base.timerBroadcaster,
    monotonicClock,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: timer.rateLimitGate,
    hub: base.hubBroadcaster,
    checkins,
    broadcaster,
    send,
    random,
    // 切断による自動公開の猶予（ADR 0028）。実 WS の試験だけが設定で縮める。
    disconnectRevealGraceMs: config.checkinRevealGraceMs,
  });
  return {
    layer,
    destroy: { checkins, checkinGrace: { clearRoom: (roomCode) => layer.clearRoom(roomCode) } },
    onRosterBroadcast: (roomCode) => layer.rosterChanged(roomCode),
    close: () => layer.clearAll(),
  };
}
