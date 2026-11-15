/**
 * ハブ（選択画面。`?tool=` 無し）の組み立て（#95 S5a。#591 で `create-sync-server.ts` から分けた。中身は変えていない）。
 *
 * ハブは道具の一覧（`application/tool-id.ts`）に載らないので、保管も破棄も後始末も持たない。
 */
import { makeHubHandlers, type HubHandlers } from "../application/hub-handlers.js";
import type { TopicBroadcaster } from "../application/topic-broadcast.js";
import type { AssemblyBase, TimerSide } from "./context.js";

/**
 * ハブ（選択画面）のメッセージ層。
 *
 * **守り（レート制限・合言葉の関門・復帰）は timer と共有する** ——
 * `join-room.ts` / `create-room.ts` を timer の入口と同じ引数で呼ぶ。
 * **レート制限のゲートも {@link TimerSide.rateLimitGate} を渡す** —— 別に作ると `connId → 鍵` の
 * 対応が空になり、`/ws` は再接続で回避できる抜け道になる。
 */
export function assembleHub(base: AssemblyBase, timer: TimerSide, topicBroadcaster: TopicBroadcaster): HubHandlers {
  return makeHubHandlers({
    store: base.store,
    timerBroadcaster: base.timerBroadcaster,
    monotonicClock: base.monotonicClock,
    timers: base.timers,
    clock: base.clock,
    codeGen: base.codeGen,
    tokenStore: base.tokens,
    rateLimitGate: timer.rateLimitGate,
    maxRooms: base.config.maxRooms,
    hub: base.hubBroadcaster,
    // 作成・参加の成功時に、いまのお題を本人へ 1 通送る（#91・E4）。
    topicBroadcaster,
  });
}
