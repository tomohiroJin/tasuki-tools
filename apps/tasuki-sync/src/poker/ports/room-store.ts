/**
 * RoomStore ポート — ルームの揮発保管（憲法 原則 III）。
 *
 * **ソケットは持たない。** 誰が接続中かは Broadcaster の担当である
 * （docs/adr/0004 の背景が挙げた「エントリがルームとソケットを同梱」の解消）。
 */
import type { Room } from '@tasuki/poker-core';

export interface RoomStore {
  get(roomId: string): Room | undefined;
  put(room: Room): void;
  remove(roomId: string): void;
  /** ID の衝突再試行に使う */
  has(roomId: string): boolean;
  /** ルーム数の上限判定に使う（上限そのものは呼び出し側が決める） */
  count(): number;
}
