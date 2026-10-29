/**
 * Check-in Cards の接続が受け取るフレームの境界検証（原則 IV）。
 *
 * 届くのは `checkin` フレーム・お題の `topic` フレーム・ハブと同じ形の応答（`room.joined`・
 * `roster`・参加の失敗）である。**見分ける順は `topic` → `checkin` → ハブ**
 * （`docs/adr/0021` 決定 2 の MUST）。札のコマンドの失敗も同じ `error` の形（コードは
 * 非空文字列）に収まるので、ハブの応答として受ける（ルーレットと同じ形）。
 *
 * `checkin` フレームの `state` は**受け手ごとに中身が違う**（匿名はサーバーが送らないことで守る）。
 * ここは形を検めるだけで、見せる・隠す判断は持たない。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubServerMsg } from '@tasuki/room-core';
import { CheckinFrameSchema, type CheckinView } from '@tasuki/checkin-core';
import { TopicFrameSchema, type TopicState } from '@tasuki/topic-core';

export type CheckinWebMessage =
  | { type: 'topic'; state: TopicState }
  | { type: 'checkin'; state: CheckinView }
  | HubServerMsg;

/** 契約に合うフレームだけを返す。合わなければ `null`（捨てる判断は同期フックが持つ）。 */
export function parseCheckinWebMessage(raw: string): CheckinWebMessage | null {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return topic.value;
  const checkin = parseBoundaryMessage(CheckinFrameSchema, raw);
  // 契約（valibot）の推論型は `names?: string[] | undefined`、`CheckinView` は `exactOptionalPropertyTypes` で
  // `names?: readonly string[]`。値の形は同じなので、型だけ `CheckinView` に合わせる（中核の型が正本）。
  if (checkin.isOk()) return { type: 'checkin', state: checkin.value.state as CheckinView };
  const hub = parseBoundaryMessage(HubServerMsgSchema, raw);
  return hub.isOk() ? hub.value : null;
}
