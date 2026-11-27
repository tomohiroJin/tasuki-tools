/**
 * 呼びかけの知らせ（`room.call` フレーム・#677）の見分け。
 *
 * 知らせはルームの全接続（玄関とすべての道具）へ届き、各画面の契約（ハブの言葉・道具の言葉）とは別の言葉なので、
 * 各画面は**自分の契約で読む前に**これで見分ける（お題の `topic` フレームと同じ置き方）。
 * 知らせでなければ（お題・ハブの言葉・壊れた JSON を含め）`null` を返し、呼び出し側が自分の契約で読む。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { RoomCallFrameSchema, type RoomCall } from '@tasuki/room-core';

export function parseRoomCallFrame(raw: string): RoomCall | null {
  const parsed = parseBoundaryMessage(RoomCallFrameSchema, raw);
  return parsed.isOk() ? parsed.value.call : null;
}
