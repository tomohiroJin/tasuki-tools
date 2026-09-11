/**
 * TimerStore ポート — timer の状態の揮発ストレージ（#95 S4a）。
 *
 * **名簿は入っていない。** 誰が居るかは `RoomStore`（`@tasuki/room-core` の `Room`）が
 * 持ち、この 2 つは `code` で突き合わせる。同じ `code` の一方だけが存在する状態は
 * 作らない（作る・消すは必ず対で行う）。
 *
 * **保管と配信を束ねた経路は 1 本ではない。** `application/handlers.ts` の `commit` が
 * 名簿と timer の状態を両方書き、`application/presence.ts` は名簿だけ、
 * `application/problem-delegation.ts` は timer の状態だけを書く（一覧と理由はその `commit`
 * の docstring）。**どの経路も配信は `application/timer-snapshot-dto.ts` の
 * `buildTimerSnapshotRoom` を通る** —— ずれへの対策はその 1 つを通すことである。
 */

import type { TimerState } from "@tasuki/timer-core";

export interface TimerStore {
  get(code: string): TimerState | undefined;
  put(state: TimerState): void;
  remove(code: string): void;
  list(): TimerState[];
}
