/**
 * RoundStore ポート — **poker の状態（投票ラウンド）**の揮発保管（憲法 原則 III・#95 S4a）。
 *
 * **名簿は入っていない。** 誰が居るかは `RoomStore`（`../../ports/room-store.ts`。
 * `@tasuki/room-core` の `Room`）が持ち、この 2 つはルームコードで突き合わせる。
 * timer 側の `TimerStore` と同じ形であり、同じ規律に従う ——
 * **同じコードの一方だけが存在する状態は作らない**（作る・消すは必ず対で行う）。
 *
 * **この規律は成立している（#95 S4a・寿命の一本化）。**
 *
 * - 作る側は `application/poker-handlers.ts` の `commit` 1 本。名簿の `put` と
 *   ラウンドの `put` を同じ関数の中で必ず対にしている（製品コードの `rounds.put` は
 *   この 1 箇所だけである）。**timer 側は事情が違う** —— 名簿だけ・timer の状態だけを
 *   書く経路が別にあり、一覧は `application/handlers.ts` の `commit` の docstring にある。
 * - 消す側は `application/destroy-room.ts` の `createRoomDestroyer` 1 本。
 *   `rounds` は**必須の依存**なので、配線から落とせば `tsc --noEmit` が赤くなる。
 *   契機は TTL 回収（`application/room-reclaimer.ts`）と在室者 0 人の退出
 *   （`application/command-handlers/participant-remove.ts`）の 2 つだが、後始末は
 *   どちらもこの 1 つの関数を通る。
 *
 * かつてはここが成立していなかった —— TTL 回収は `RoundStore` を知らず（ラウンドが残る）、
 * poker の即時破棄（旧 `discardRoom`）は `TimerStore` を知らなかった（timer の状態が
 * 孤児として残る）。**即時破棄を撤去して経路を 1 本に寄せたことで両方が消えた。**
 * ここへ「poker だけの破棄」を足し戻すと、片側の取りこぼしがそのまま戻る。
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
