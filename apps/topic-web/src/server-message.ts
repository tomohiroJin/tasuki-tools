/**
 * お題の接続が受け取るフレームの境界検証（原則 IV）。
 *
 * 届くのは `topic` フレームと、ハブと同じ形の応答（`room.joined`・参加の失敗）である
 * （`apps/tasuki-sync/src/ports/topic-server-msg.ts`）。**参加の失敗はハブのコード体系**
 * （`ROOM_NOT_FOUND`・`PASSPHRASE_REQUIRED` 等）なので、お題のエラーのスキーマでは検めない。
 * お題のコマンドの失敗（`GENERATION_COOLDOWN` 等）もハブの `error` の形（コードは非空文字列）に収まる。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, RoomCallFrameSchema, type HubServerMsg, type RoomCall } from '@tasuki/room-core';
import { TopicFrameSchema, type TopicState } from '@tasuki/topic-core';

export type TopicWebMessage = { type: 'topic'; state: TopicState } | HubServerMsg;

/** 契約に合うフレームだけを返す。合わなければ `null`（捨てる判断は同期フックが持つ）。 */
export function parseTopicWebMessage(raw: string): TopicWebMessage | null {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return topic.value;
  const hub = parseBoundaryMessage(HubServerMsgSchema, raw);
  return hub.isOk() ? hub.value : null;
}

/** 呼びかけの知らせ（`room.call`・#677）なら中身を返す。そうでなければ `null`（同期フックが契約より先に呼ぶ）。 */
export function parseTopicRoomCall(raw: string): RoomCall | null {
  const parsed = parseBoundaryMessage(RoomCallFrameSchema, raw);
  return parsed.isOk() ? parsed.value.call : null;
}
