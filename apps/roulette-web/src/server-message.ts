/**
 * ルーレットの接続が受け取るフレームの境界検証（原則 IV・spec §5.3）。
 *
 * 届くのは `roulette` フレーム・お題の `topic` フレーム・ハブと同じ形の応答（`room.joined`・
 * `roster`・参加の失敗）である。**見分ける順は `topic` → `roulette` → ハブ。** 参加の失敗のコードは
 * ハブの体系（`ROOM_NOT_FOUND` 等）で、ルーレットのコマンドの失敗も同じ `error` の形（コードは
 * 非空文字列）に収まるので、ルーレットのエラーのスキーマでは検めない（topic-web と同じ形）。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubServerMsg } from '@tasuki/room-core';
import { RouletteFrameSchema, type RouletteView } from '@tasuki/roulette-core';
import { TopicFrameSchema, type TopicState } from '@tasuki/topic-core';

export type RouletteWebMessage =
  | { type: 'topic'; state: TopicState }
  | { type: 'roulette'; state: RouletteView }
  | HubServerMsg;

/** 契約に合うフレームだけを返す。合わなければ `null`（捨てる判断は同期フックが持つ）。 */
export function parseRouletteWebMessage(raw: string): RouletteWebMessage | null {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return topic.value;
  const roulette = parseBoundaryMessage(RouletteFrameSchema, raw);
  if (roulette.isOk()) return roulette.value;
  const hub = parseBoundaryMessage(HubServerMsgSchema, raw);
  return hub.isOk() ? hub.value : null;
}
