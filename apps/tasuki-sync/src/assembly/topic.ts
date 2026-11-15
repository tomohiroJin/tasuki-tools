/**
 * お題（`?tool=topic`）の組み立て（#91。#591 で `create-sync-server.ts` から分けた。中身は変えていない）。
 *
 * **2 段に分かれている。** お題は**ツールではなくルームに属する**ので、保管と配信（{@link createTopicResources}）を
 * timer のハンドラ（`makeHandlers`）が先に要る（参加・作成した本人へお題の状態を 1 通送る・完成記録に
 * タイトルを写す）。メッセージ層（{@link assembleTopic}）はそのハンドラのゲートを受けるので、あとで組む。
 */
import { ClaudeCliTopicProvider } from "../adapters/claude-cli-topic-provider.js";
import { InMemoryTopicStore } from "../adapters/in-memory-topic-store.js";
import { AiLimiter } from "../application/ai-limits.js";
import { makeTopicBroadcaster, type TopicBroadcaster } from "../application/topic-broadcast.js";
import { TopicGenerator } from "../application/topic-generation.js";
import { makeTopicHandlers, type TopicHandlers } from "../application/topic-handlers.js";
import type { AssemblyBase, TimerSide, ToolPartBase } from "./context.js";

/** AI お題生成の予算。 */
export interface AiBudget {
  /** AI お題生成が有効か（OAuth トークンと解錠合言葉が**両方**あるときだけ true）。 */
  readonly aiReady: boolean;
  /**
   * **サーバー全体で 1 つの予算である。** 日次上限と同時実行数を AI を使う箇所ごとに作ると、
   * その分だけ予算が黙って増える。
   */
  readonly aiLimiter: AiLimiter | undefined;
}

/** 設定から AI の予算を決める（トークンと合言葉が両方あるときだけ有効。spec 2026-06-12 参照）。 */
export function createAiBudget(base: Pick<AssemblyBase, "config" | "clock">): AiBudget {
  const { config, clock } = base;
  const aiReady = Boolean(config.claudeOauthToken && config.aiUnlockKey);
  return { aiReady, aiLimiter: aiReady ? new AiLimiter({ clock, dailyLimit: config.aiDailyLimit }) : undefined };
}

/** お題の保管と配信と生成。timer のハンドラが先に要る。 */
export interface TopicResources {
  readonly topics: InMemoryTopicStore;
  /**
   * お題の状態の配信（#91）。**ツールごとの broadcaster の外に 1 つ置く**（spec §5.3 の T3）。
   * 宛先の選別（ルームの全接続 —— お題・ハブ・timer・poker）は `topic-broadcast.ts` が持つ。
   */
  readonly broadcaster: TopicBroadcaster;
  readonly generator: TopicGenerator;
}

export function createTopicResources(
  base: AssemblyBase,
  ai: AiBudget,
): TopicResources {
  const { config, store, clock, logger, refEncoder, ws } = base;
  const topics = new InMemoryTopicStore();
  const broadcaster = makeTopicBroadcaster({
    store,
    topics,
    send: (connIds, msg) => ws.get().to.topic.broadcast(connIds, msg),
  });
  const generator = new TopicGenerator({
    topics,
    clock,
    publish: (roomCode) => broadcaster.publish(roomCode),
    provider: ai.aiReady
      ? new ClaudeCliTopicProvider({ token: config.claudeOauthToken!, model: config.aiProblemModel })
      : undefined,
    aiLimiter: ai.aiLimiter,
    aiTimeoutMs: config.aiGenerationTimeoutMs,
    logger,
    refEncoder,
  });
  return { topics, broadcaster, generator };
}

/** お題の組み立て結果。 */
export interface TopicPart extends ToolPartBase {
  /** WS アダプタへ渡すメッセージ層。 */
  readonly layer: TopicHandlers;
  /** 破棄の共通経路へ渡す分（寿命はルームごとに 1 つ）。 */
  readonly destroy: {
    readonly topics: TopicResources["topics"];
    readonly topicGenerator: TopicResources["generator"];
  };
}

/**
 * お題のメッセージ層（#91）。
 *
 * **参加の守り（レート制限・合言葉の関門・復帰）はハブと同じく `join-room.ts` を通す。**
 * **レート制限のゲートは {@link TimerSide.rateLimitGate} を渡す。新しく作らない** ——
 * 別に作ると `connId → クライアント鍵` の対応が空になり、`ai.unlock` の総当たりが
 * **張り直すだけで**枠を回避でき、`room.join` とも別の枠になる（`handlers.ts` の「★取り違えないこと」）。
 */
export function assembleTopic(
  base: AssemblyBase,
  timer: TimerSide,
  resources: TopicResources,
  ai: AiBudget,
): TopicPart {
  const { config, store, timers, clock, codeGen, tokens, monotonicClock, ws } = base;
  const layer = makeTopicHandlers({
    store,
    timerBroadcaster: base.timerBroadcaster,
    monotonicClock,
    timers,
    clock,
    codeGen,
    tokenStore: tokens,
    rateLimitGate: timer.rateLimitGate,
    hub: base.hubBroadcaster,
    topics: resources.topics,
    generator: resources.generator,
    broadcaster: resources.broadcaster,
    send: (connId, msg) => ws.get().to.topic.send(connId, msg),
    // トークン未設定なら合言葉も渡さない＝解錠は常に失敗（存在秘匿）
    aiUnlockKey: ai.aiReady ? config.aiUnlockKey : undefined,
  });
  return {
    layer,
    destroy: { topics: resources.topics, topicGenerator: resources.generator },
    // お題の生成も止める（子プロセスを残さない。#91）。
    close: () => resources.generator.cancelAll(),
  };
}
