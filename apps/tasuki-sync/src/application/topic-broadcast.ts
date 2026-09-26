/**
 * お題の状態を配る（#91・spec T3）。
 *
 * 配信先は**ルームの全接続**（お題・ハブ・timer・poker）。
 *
 * 宛先は**呼び出し時点の名簿**から決まる（`create-sync-server.ts` の `recipientsOf` と同じ規則）。
 * 保管より先に配ると 1 つ前の名簿に送ることになるので、**保管のあとに呼ぶ**。
 */
import { connectionsIn, type ToolId } from "@tasuki/room-core";
import { INITIAL_TOPIC_STATE, type TopicState } from "@tasuki/topic-core";
import type { RoomStore } from "../ports/room-store.js";
import type { TopicStore } from "../ports/topic-store.js";
import type { TopicServerMsg } from "../ports/topic-server-msg.js";
import { TOOL_HUB } from "./hub-handlers.js";
import { TOOL_TOPIC, TOOL_TIMER, TOOL_POKER } from "./tool-id.js";

/**
 * お題の状態を受け取る接続のツール。**ルームの全接続である**（spec T3・E2）。
 *
 * PR 1・2 の間はお題とハブだけだった —— 玄関は契約に合わないフレームを黙って捨てるので
 * 害が無かったが、timer と poker は捨てたことを利用者へ通知する（#209・#212）ため、
 * 両者が `topic` フレームを先に見分けるようになった PR 3 で足した。
 */
export const TOPIC_RECIPIENT_TOOLS: readonly (ToolId | null)[] = [
  TOOL_TOPIC,
  TOOL_HUB,
  TOOL_TIMER,
  TOOL_POKER,
];

export interface TopicBroadcasterDeps {
  store: Pick<RoomStore, "get">;
  topics: TopicStore;
  send: (connIds: string[], msg: TopicServerMsg) => void;
}

export interface TopicBroadcaster {
  /** そのルームの配信先すべてへ、いまのお題の状態を 1 通ずつ送る */
  publish(roomCode: string): void;
  /** 参加・復帰した 1 本の接続へ、いまのお題の状態を送る（無ければ既定の状態を置いてから送る） */
  sendCurrent(connId: string, roomCode: string): void;
}

export function makeTopicBroadcaster(deps: TopicBroadcasterDeps): TopicBroadcaster {
  /**
   * 配信先。`connectionsIn` は 1 つのツールしか受けないので、ツールごとに引いて並べる。
   * 1 本の接続が宣言するツールは 1 つだけ（`Participant.connections` は connId → tool の Map）
   * なので、**ツールをまたいで同じ connId が重複することはない**。
   */
  const recipientsOf = (roomCode: string): string[] => {
    const room = deps.store.get(roomCode);
    if (room === undefined) return [];
    return TOPIC_RECIPIENT_TOOLS.flatMap((tool) => connectionsIn(room, tool));
  };

  const stateOf = (roomCode: string): TopicState => {
    const current = deps.topics.get(roomCode);
    if (current !== undefined) return current;
    deps.topics.put(roomCode, INITIAL_TOPIC_STATE);
    return INITIAL_TOPIC_STATE;
  };

  return {
    publish(roomCode) {
      const state = deps.topics.get(roomCode);
      if (state === undefined) return; // ルームが消えた・まだ誰もお題に触れていない
      deps.send(recipientsOf(roomCode), { type: "topic", state });
    },
    sendCurrent(connId, roomCode) {
      // ルームが消えていたら状態を置かない（置くと、破棄の後始末が済んだルームに
      // お題の状態だけが残る）。
      if (deps.store.get(roomCode) === undefined) return;
      deps.send([connId], { type: "topic", state: stateOf(roomCode) });
    },
  };
}
