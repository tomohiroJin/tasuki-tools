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

/**
 * お題の接続へ、アダプタ自身が組み立てて送るフレーム（#91 R18）。
 *
 * **`TopicServerMsg` より狭い。** `TopicServerMsg` は `HubServerMsg` を合併しており、
 * `HubServerMsg` の `error` は `code: string`（無制約）なので、お題の契約
 * （`TOPIC_ERROR_CODES`）に無いコードでも `TopicServerMsg` としては型検査を通ってしまう。
 * アダプタが自分の判断でエラーフレームを組み立てて送る経路（`sendTopicFrame`）は
 * この狭い型へ絞り、契約に無いコードをコンパイルエラーにする。
 *
 * `sendTopic` / `broadcastTopic`（公開 API・Task 9 が `room.joined` 等のハブ形の
 * 応答に使う）は引き続き広い `TopicServerMsg` を使う。ここを狭めるのはアダプタが
 * 自分でエラーを組み立てる経路だけである。
 */
export type TopicOwnFrame = v.InferOutput<typeof TopicFrameSchema> | v.InferOutput<typeof TopicErrorFrameSchema>;
