/**
 * チェックインの接続へ送るフレーム（#406）。
 *
 * `room.joined` はハブと同じ形を返すので `HubServerMsg` から取り込む（先例: `roulette-server-msg.ts`）。
 * **`state` は受け手ごとに中身が違う**（匿名は送らないことで守る。設計 §6）。そのためアダプタには
 * 1 本だけ送る口（`sendCheckin`）しか作らず、全員へ同じものを送る口は作らない。
 *
 * アダプタ（`adapters/ws-adapter.ts`）とアプリ層の両方が使うので、どちらにも依存しないポートに置く。
 */
import type { HubServerMsg } from "@tasuki/room-core";
import type { CheckinErrorCode, CheckinView } from "@tasuki/checkin-core";

/** 契約のコード（`CheckinErrorCode`）に絞ったエラー */
type CheckinErrorFrame = { type: "error"; code: CheckinErrorCode; message: string };

export type CheckinServerMsg =
  | { type: "checkin"; state: CheckinView }
  | CheckinErrorFrame
  | Extract<HubServerMsg, { type: "room.joined" | "error" }>;

/**
 * チェックインの接続へ、アダプタ自身が組み立てて送るフレーム（サイズ超過・内部エラー）。
 * **`CheckinServerMsg` より狭い**: `HubServerMsg` の `error` は `code: string`（無制約）なので、
 * 契約のコードだけに絞る（`RouletteOwnFrame` と同じ理由）。
 */
export type CheckinOwnFrame = CheckinErrorFrame;
