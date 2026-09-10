/**
 * RoomStore ポート — **名簿**の揮発ストレージ（#95 S4a）。
 *
 * 保管するのはメンバーシップ文脈のルーム（`@tasuki/room-core` の `Room`）である。
 * timer の状態は `TimerStore` が別に持ち、`code` で突き合わせる。
 */

import type { Room } from "@tasuki/room-core";

export interface RoomStore {
  get(code: string): Room | undefined;
  put(room: Room): void;
  remove(code: string): void;
  list(): Room[];
}
