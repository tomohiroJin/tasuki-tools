/**
 * うちわけ（track）の接続へ送るフレーム（#476）。`room.joined` や `roster` はハブと同じ形を返すので
 * `HubServerMsg` を含む。お題の `topic` フレームも track の接続へ届く（`docs/adr/0021` 決定 2。
 * 配信先は道具の一覧から自動で入る）が、お題の配信の層が自分の型で送るので、この和には含めない
 * （track-web は `topic` を先に見分ける）。
 *
 * アダプタ（`adapters/ws-adapter.ts`）とアプリ層の両方が使うので、どちらにも依存しないポートに置く。
 */
import type * as v from "valibot";
import type { TrackErrorFrameSchema, TrackFrameSchema } from "@tasuki/track-core";
import type { HubServerMsg } from "@tasuki/room-core";

export type TrackServerMsg =
  | v.InferOutput<typeof TrackFrameSchema>
  | v.InferOutput<typeof TrackErrorFrameSchema>
  | HubServerMsg;

/**
 * track の接続へ、アダプタ自身が組み立てて送るフレーム。
 *
 * **`TrackServerMsg` より狭い。** `HubServerMsg` の `error` は `code: string`（無制約）なので、
 * track の契約（`TRACK_ERROR_CODES`）に無いコードも広い型は通してしまう。サイズ超過・内部エラーは
 * この狭い型へ絞る（`AgendaOwnFrame` と同じ理由）。
 */
export type TrackOwnFrame = v.InferOutput<typeof TrackFrameSchema> | v.InferOutput<typeof TrackErrorFrameSchema>;
