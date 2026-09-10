/**
 * RoundStore ポート — **poker の状態（投票ラウンド）**の揮発保管（憲法 原則 III・#95 S4a）。
 *
 * **名簿は入っていない。** 誰が居るかは `RoomStore`（`../../ports/room-store.ts`。
 * `@tasuki/room-core` の `Room`）が持ち、この 2 つはルームコードで突き合わせる。
 * timer 側の `TimerStore` と同じ形であり、同じ規律に従う ——
 * **同じコードの一方だけが存在する状態は作らない**（作る・消すは必ず対で行う）。
 *
 * ⚠ **その規律はこの段ではまだ成立していない。** ルームを消す経路は 2 つあるが、
 * TTL 回収（`application/room-reclaimer.ts` → `application/destroy-room.ts`）は
 * `RoundStore` を知らない。つまり**名簿だけが消えてラウンドが残る**状態が作れる
 * （`poker/application/handlers.ts` の `discardRoom` は両方消すので、そちらは対のまま）。
 * `createRoomDestroyer` へ `RoundStore` の解放を足すのは次の段であり、
 * それが入って初めて上の宣言が実体に追いつく。
 *
 * **ソケットは持たない。** 誰が接続中かは Broadcaster の担当である
 * （docs/adr/0004 の背景が挙げた「エントリがルームとソケットを同梱」の解消）。
 */
import type { Round } from '@tasuki/poker-core';

export interface RoundStore {
  get(roomId: string): Round | undefined;
  put(roomId: string, round: Round): void;
  remove(roomId: string): void;
}
