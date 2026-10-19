/**
 * 進行タイマーの接続が受け取るフレームの境界検証（原則 IV）。
 *
 * 届くのは `agenda` フレーム・お題の `topic` フレーム・ハブと同じ形の応答（`room.joined`・
 * `roster`・参加の失敗）である。**見分ける順は `topic` → `agenda` → ハブ**
 * （`docs/adr/0021` 決定 2 の MUST）。進行タイマーのコマンドの失敗も同じ `error` の形（コードは
 * 非空文字列）に収まるので、ハブの応答として受ける（ルーレット・topic-web と同じ形）。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubServerMsg } from '@tasuki/room-core';
import { AgendaFrameSchema, type AgendaView } from '@tasuki/agenda-core';
import { TopicFrameSchema, type TopicState } from '@tasuki/topic-core';

export type AgendaWebMessage =
  | { type: 'topic'; state: TopicState }
  | { type: 'agenda'; state: AgendaView }
  | HubServerMsg;

/** 契約に合うフレームだけを返す。合わなければ `null`（捨てる判断は同期フックが持つ）。 */
export function parseAgendaWebMessage(raw: string): AgendaWebMessage | null {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return topic.value;
  const agenda = parseBoundaryMessage(AgendaFrameSchema, raw);
  if (agenda.isOk()) return agenda.value;
  const hub = parseBoundaryMessage(HubServerMsgSchema, raw);
  return hub.isOk() ? hub.value : null;
}
