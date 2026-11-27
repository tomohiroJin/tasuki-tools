/**
 * うちわけの接続が受け取るフレームの境界検証（原則 IV）。
 *
 * 届くのは `track` フレーム・お題の `topic` フレーム・ハブと同じ形の応答（`room.joined`・`roster`・参加の失敗）である。
 * **見分ける順は `topic` → `track` → ハブ**（`docs/adr/0021` 決定 2 の MUST）。うちわけのコマンドの失敗も
 * 同じ `error` の形（コードは非空文字列）に収まるので、ハブの応答として受ける（agenda-web と同じ形）。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, RoomCallFrameSchema, type HubServerMsg, type RoomCall } from '@tasuki/room-core';
import { TopicFrameSchema, type TopicState } from '@tasuki/topic-core';
import { TrackFrameSchema, type TrackView } from '@tasuki/track-core';

export type TrackWebMessage = { type: 'topic'; state: TopicState } | { type: 'track'; state: TrackView } | HubServerMsg;

/** 契約に合うフレームだけを返す。合わなければ `null`（捨てる判断は同期フックが持つ）。 */
export function parseTrackWebMessage(raw: string): TrackWebMessage | null {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return topic.value;
  const track = parseBoundaryMessage(TrackFrameSchema, raw);
  if (track.isOk()) return track.value;
  const hub = parseBoundaryMessage(HubServerMsgSchema, raw);
  return hub.isOk() ? hub.value : null;
}

/** 呼びかけの知らせ（`room.call`・#677）なら中身を返す。そうでなければ `null`（同期フックが契約より先に呼ぶ）。 */
export function parseTrackRoomCall(raw: string): RoomCall | null {
  const parsed = parseBoundaryMessage(RoomCallFrameSchema, raw);
  return parsed.isOk() ? parsed.value.call : null;
}
