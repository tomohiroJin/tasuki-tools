/**
 * ルーレットの接続へ送るフレーム（#94）。`room.joined` や `roster` はハブと同じ形を返すので
 * `HubServerMsg` を含む。お題の `topic` フレームもルーレットの接続へ配る（spec R15）ので含む。
 *
 * アダプタ（`adapters/ws-adapter.ts`）とアプリ層の両方が使うので、どちらにも依存しないポートに置く。
 */
import type * as v from "valibot";
import type { HubServerMsg } from "@tasuki/room-core";
import type { RouletteErrorFrameSchema, RouletteFrameSchema } from "@tasuki/roulette-core";
import type { TopicFrameSchema } from "@tasuki/topic-core";

export type RouletteServerMsg =
  | v.InferOutput<typeof RouletteFrameSchema>
  | v.InferOutput<typeof RouletteErrorFrameSchema>
  | v.InferOutput<typeof TopicFrameSchema>
  | HubServerMsg;

/**
 * ルーレットの接続へ、アダプタ自身が組み立てて送るフレーム。
 *
 * **`RouletteServerMsg` より狭い。** `HubServerMsg` の `error` は `code: string`（無制約）なので、
 * ルーレットの契約（`ROULETTE_ERROR_CODES`）に無いコードも広い型は通してしまう。
 * アダプタが自分でエラーを組み立てて送る経路（サイズ超過・内部エラー）はこの狭い型へ絞る
 * （お題の `TopicOwnFrame` と同じ理由）。
 */
export type RouletteOwnFrame = v.InferOutput<typeof RouletteFrameSchema> | v.InferOutput<typeof RouletteErrorFrameSchema>;
