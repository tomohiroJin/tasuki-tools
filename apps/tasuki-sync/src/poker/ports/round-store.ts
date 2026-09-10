/**
 * RoundStore ポート — **poker の状態（投票ラウンド）**の揮発保管（憲法 原則 III・#95 S4a）。
 *
 * **名簿は入っていない。** 誰が居るかは `RoomStore`（`../../ports/room-store.ts`。
 * `@tasuki/room-core` の `Room`）が持ち、この 2 つはルームコードで突き合わせる。
 * timer 側の `TimerStore` と同じ形であり、同じ規律に従う ——
 * **同じコードの一方だけが存在する状態は作らない**（作る・消すは必ず対で行う）。
 *
 * ⚠ **その規律はこの段ではまだ成立していない。ルームを消す経路が 2 つあり、
 * どちらも自分の知らない保管を取りこぼす。**
 *
 * - TTL 回収（`application/room-reclaimer.ts` → `application/destroy-room.ts`）は
 *   `RoundStore` を知らない。**名簿と timer の状態が消えてラウンドが残る。**
 * - poker の即時破棄（`poker/application/handlers.ts` の `discardRoom`）は
 *   名簿とラウンドを対で消すが、**`TimerStore` を知らない**（poker の `HandlerDeps` に
 *   `TimerStore` は無い）。越境した timer のルームをそこで捨てると、
 *   **timer の状態が孤児として残る。**
 *
 * `createRoomDestroyer` へ `RoundStore` の解放を足し、即時破棄を撤去して経路を 1 本に
 * 寄せるのは次の段であり、それが入って初めて上の宣言が実体に追いつく。
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
