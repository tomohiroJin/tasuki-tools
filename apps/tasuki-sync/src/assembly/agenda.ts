/**
 * 進行タイマー（`?tool=agenda`）の組み立て（#429。#591 で `create-sync-server.ts` から分けた。中身は変えていない）。
 */
import { InMemoryAgendaStore } from "../adapters/in-memory-agenda-store.js";
import { makeAgendaBroadcaster } from "../application/agenda-broadcast.js";
import { makeAgendaDeadlines, type AgendaDeadlines } from "../application/agenda-deadlines.js";
import { makeAgendaHandlers, type AgendaHandlers } from "../application/agenda-handlers.js";
import type { AssemblyBase, TimerSide, ToolPartBase } from "./context.js";

export interface AgendaPart extends ToolPartBase {
  /** WS アダプタへ渡すメッセージ層。 */
  readonly layer: AgendaHandlers;
  /** 破棄の共通経路へ渡す分。 */
  readonly destroy: {
    readonly agendas: InMemoryAgendaStore;
    readonly agendaDeadlines: AgendaDeadlines;
  };
}

/**
 * 進行タイマーのメッセージ層と配信（#429）。
 *
 * **参加の守りはルーレットと同じく `join-room.ts` を通し、レート制限のゲートも {@link TimerSide.rateLimitGate}
 * を渡す。新しく作らない**。期限の予約（timer の `scheduler` とは別のインスタンス）は**単調時計**で測り、
 * ハンドラも同じ単調時計を共有する。
 */
export function assembleAgenda(base: AssemblyBase, timer: TimerSide): AgendaPart {
  const { store, timers, clock, codeGen, tokens, monotonicClock, logger, ws } = base;
  const agendas = new InMemoryAgendaStore();
  const agendaDeadlines = makeAgendaDeadlines({
    clock: monotonicClock,
    timer: { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  });
  const broadcaster = makeAgendaBroadcaster({
    store,
    agendas,
    clock: monotonicClock,
    send: (connIds, msg) => ws.get().to.agenda.broadcast(connIds, msg),
  });
  const layer = makeAgendaHandlers({
    store,
    timerBroadcaster: base.timerBroadcaster,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: timer.rateLimitGate,
    hub: base.hubBroadcaster,
    agendas,
    broadcaster,
    send: (connId, msg) => ws.get().to.agenda.send(connId, msg),
    monotonicClock,
    deadlines: agendaDeadlines,
    logger,
  });
  return {
    layer,
    destroy: { agendas, agendaDeadlines },
    close: () => agendaDeadlines.clearAll(),
  };
}
