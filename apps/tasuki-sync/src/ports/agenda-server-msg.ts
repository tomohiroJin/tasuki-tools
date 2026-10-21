/**
 * 進行タイマー（agenda）の接続へ送るフレーム（#429）。`room.joined` や `roster` はハブと同じ形を返すので
 * `HubServerMsg` を含む。お題の `topic` フレームも agenda の接続へ届く（`docs/adr/0021` 決定 2・
 * `application/topic-broadcast.ts` の宛先に `TOOL_AGENDA` がある）が、お題の配信の層が自分の型で送るので
 * この和には含めない（agenda-web は `topic` を先に見分ける）。
 *
 * アダプタ（`adapters/ws-adapter.ts`）とアプリ層の両方が使うので、どちらにも依存しないポートに置く。
 */
import type * as v from "valibot";
import type { AgendaErrorFrameSchema, AgendaFrameSchema } from "@tasuki/agenda-core";
import type { HubServerMsg } from "@tasuki/room-core";

export type AgendaServerMsg =
  | v.InferOutput<typeof AgendaFrameSchema>
  | v.InferOutput<typeof AgendaErrorFrameSchema>
  | HubServerMsg;

/**
 * agenda の接続へ、アダプタ自身が組み立てて送るフレーム。
 *
 * **`AgendaServerMsg` より狭い。** `HubServerMsg` の `error` は `code: string`（無制約）なので、
 * agenda の契約（`AGENDA_ERROR_CODES`）に無いコードも広い型は通してしまう。サイズ超過・内部エラーは
 * この狭い型へ絞る（`RouletteOwnFrame` と同じ理由）。
 */
export type AgendaOwnFrame = v.InferOutput<typeof AgendaFrameSchema> | v.InferOutput<typeof AgendaErrorFrameSchema>;
