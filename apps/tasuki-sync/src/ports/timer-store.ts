/**
 * TimerStore ポート — timer の状態の揮発ストレージ（#95 S4a）。
 *
 * **名簿は入っていない。** 誰が居るかは `RoomStore`（`@tasuki/room-core` の `Room`）が
 * 持ち、この 2 つは `code` で突き合わせる。同じ `code` の一方だけが存在する状態は
 * 作らない（作る・消すは必ず対で行う）。
 */

import type { TimerState } from "@tasuki/timer-core";

export interface TimerStore {
  get(code: string): TimerState | undefined;
  put(state: TimerState): void;
  remove(code: string): void;
  list(): TimerState[];
}
