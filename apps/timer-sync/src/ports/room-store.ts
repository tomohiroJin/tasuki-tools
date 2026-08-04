/**
 * RoomStore ポート — ルームの揮発ストレージ
 */

import type { Room } from "@tasuki/timer-core";

export interface RoomStore {
  get(code: string): Room | undefined;
  put(room: Room): void;
  remove(code: string): void;
  list(): Room[];
}
