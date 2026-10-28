/**
 * チェックインの接続へ送るフレーム（#406）。
 *
 * `room.joined` や `roster` はハブと同じ形で、ハブ経由の層が自分の型で送るので、この和には含めない。
 * **`state` は受け手ごとに中身が違う**（匿名は送らないことで守る。設計 §6）。そのためアダプタには
 * 1 本だけ送る口（`sendCheckin`）しか作らず、全員へ同じものを送る口は作らない。
 *
 * アダプタ（`adapters/ws-adapter.ts`）とアプリ層の両方が使うので、どちらにも依存しないポートに置く。
 */
import type { CheckinErrorCode, CheckinView } from "@tasuki/checkin-core";

export type CheckinServerMsg =
  | { type: "checkin"; state: CheckinView }
  | { type: "error"; code: CheckinErrorCode; message: string };

/**
 * checkin の接続へ、アダプタ自身が組み立てて送るフレーム（サイズ超過・内部エラー）。
 * `CheckinServerMsg` のエラー側と同じ形で、契約のコード（`CheckinErrorCode`）に絞る。
 */
export type CheckinOwnFrame = Extract<CheckinServerMsg, { type: "error" }>;
