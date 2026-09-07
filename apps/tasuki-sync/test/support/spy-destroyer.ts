/**
 * spyDestroyer — 後始末の呼び出しを記録するルーム破棄経路（Issue #79）
 *
 * `server.ts` が本番で組み立てるのと同じ `createRoomDestroyer` に、記録だけを行う
 * スケジューラ・委譲・presence・トークン解放を差した破棄経路を返す。ストアだけは
 * 本物を渡すので、「後始末が全部呼ばれたか」と「ルームが実際に消えたか」を
 * 同じ 1 つの経路で観測できる。
 *
 * 記録は `"scheduler.clear:CODE"` のような文字列にする。**順序も含めて**
 * `toEqual` で固定したいので、呼ばれた種類と対象コードを 1 本の並びで持つ。
 *
 * このヘルパ自身の挙動（記録の書式と並び）は `test/destroy-room.test.ts` が
 * `createRoomDestroyer` の検証として直接固定しているため、専用のテストは置かない
 * （同じ内容を 2 箇所で書くことになるため）。
 */

import { createRoomDestroyer } from "../../src/application/destroy-room.js";
import type { InMemoryRoomStore } from "../../src/adapters/in-memory-room-store.js";

export interface SpyDestroyer {
  /** ルームを破棄する（`createRoomDestroyer` の戻り値そのもの）。 */
  destroy: (roomCode: string) => void;
  /** 呼ばれた後始末の並び（`"種類:ルームコード"`）。 */
  calls: string[];
}

export function spyDestroyer(store: InMemoryRoomStore): SpyDestroyer {
  const calls: string[] = [];
  const destroy = createRoomDestroyer({
    store,
    scheduler: { clear: (c) => calls.push(`scheduler.clear:${c}`) },
    delegator: { cancel: (c) => calls.push(`delegator.cancel:${c}`) },
    presence: { clearRoomTimers: (c) => calls.push(`presence.clearRoomTimers:${c}`) },
    releaseRoom: (c) => calls.push(`releaseRoom:${c}`),
  });
  return { destroy, calls };
}
