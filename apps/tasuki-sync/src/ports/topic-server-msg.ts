/**
 * お題の接続へ送るフレーム（#91）。`room.joined` はハブと同じ形を返すので `HubServerMsg` を含む。
 *
 * **ハブの接続へ `topic` フレームを送るときもこの型で送る**（玄関は契約に合わないフレームを黙って捨てる）。
 * この PR の配信先はお題の接続とハブの接続だけなので（spec §9）、`WsAdapter#sendTopic` /
 * `#broadcastTopic` はどちらの接続へも同じ型で送れるようにしてある。
 *
 * アダプタ（`adapters/ws-adapter.ts`）とアプリ層（Task 9 の配線）の両方が使うので、
 * どちらにも依存しないポートに置く。
 */
import type * as v from "valibot";
import type { HubServerMsg } from "@tasuki/room-core";
import type { TopicErrorFrameSchema, TopicFrameSchema } from "@tasuki/topic-core";

export type TopicServerMsg =
  | v.InferOutput<typeof TopicFrameSchema>
  | v.InferOutput<typeof TopicErrorFrameSchema>
  | HubServerMsg;
