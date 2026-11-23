/**
 * うちわけ（`?tool=track`）の組み立て（#476）。
 */
import { InMemoryTrackStore } from "../adapters/in-memory-track-store.js";
import { makeTrackAutoStop } from "../application/track-auto-stop.js";
import { makeTrackBroadcaster } from "../application/track-broadcast.js";
import { makeTrackHandlers, type TrackHandlers } from "../application/track-handlers.js";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { AssemblyBase, TimerSide, ToolPartBase } from "./context.js";

export interface TrackPart extends ToolPartBase {
  /** WS アダプタへ渡すメッセージ層。 */
  readonly layer: TrackHandlers;
  /** 破棄の共通経路へ渡す分。 */
  readonly destroy: {
    readonly tracks: InMemoryTrackStore;
    readonly trackAutoStop: { clearRoom(roomCode: string): void };
  };
}

/**
 * うちわけのメッセージ層と配信（#476）。
 *
 * **参加の守りは進行タイマーと同じく `join-room.ts` を通し、レート制限のゲートも {@link TimerSide.rateLimitGate}
 * を渡す。新しく作らない**。時刻軸と全員切断の猶予は**単調時計**（整数の ms に切り捨てたもの）で測り、ハンドラも同じ単調時計を共有する。
 *
 * 名簿が配られるたびに（{@link ToolPartBase.onRosterBroadcast}）全員が不在かを数え直し、
 * 止めるとき・破棄のときに猶予の予約を解放する。
 */
export function assembleTrack(base: AssemblyBase, timer: TimerSide): TrackPart {
  const { config, store, timers, clock, codeGen, tokens, logger, ws } = base;
  // **うちわけへ渡す単調時計は、整数の ms に切り捨てる。** 元の時計（`performance.now()`）は小数の ms を返す。
  // 時刻軸の位置は整数で持つ約束で（`packages/track-core/src/limits.ts`）、境界のスキーマも整数の位置だけを受ける。
  // 小数のまま渡すと区切りの位置が小数になり、画面が「いまの位置 ± 1 分」で送る手直しが境界で拒まれる。
  const monotonicClock: MonotonicClock = { now: () => Math.floor(base.monotonicClock.now()) };
  const tracks = new InMemoryTrackStore();
  const broadcaster = makeTrackBroadcaster({
    store,
    tracks,
    clock: monotonicClock,
    wallClock: clock,
    send: (connIds, msg) => ws.get().to.track.broadcast(connIds, msg),
  });
  const autoStop = makeTrackAutoStop({
    store,
    tracks,
    clock: monotonicClock,
    timer: { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) },
    publish: (roomCode) => broadcaster.publish(roomCode),
    // 実 WS の試験だけが設定で縮める。
    graceMs: config.trackAutoStopGraceMs,
  });
  const layer = makeTrackHandlers({
    store,
    timerBroadcaster: base.timerBroadcaster,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: timer.rateLimitGate,
    hub: base.hubBroadcaster,
    tracks,
    broadcaster,
    send: (connId, msg) => ws.get().to.track.send(connId, msg),
    monotonicClock,
    logger,
  });
  return {
    layer,
    destroy: { tracks, trackAutoStop: { clearRoom: (roomCode) => autoStop.clearRoom(roomCode) } },
    onRosterBroadcast: (roomCode) => autoStop.rosterChanged(roomCode),
    close: () => autoStop.clearAll(),
  };
}
