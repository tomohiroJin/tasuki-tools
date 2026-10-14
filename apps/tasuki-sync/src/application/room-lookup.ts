/**
 * 接続からルームを引く問い合わせ（#366）。**この走査はここだけに置く**（`test/room-lookup-sources.test.ts`）。
 *
 * 接続がどのルームに居るかを別の表に持たず、名簿（`RoomStore`）を引いて決める。表を 2 つ持つと、
 * 退出や破棄で片方だけが更新され、居ないルームを操作できてしまう（`topic-handlers.ts` の旧い注記）。
 *
 * 以前は同じ走査が 7 か所に写されていた（hub・topic・roulette の 2 度目の参加の確かめ、topic と roulette の
 * 「ツールとして在席しているルーム」、timer のコマンドの宛先、presence の切断）。
 * 走査は `store.list()` の順で、最初に当たったルームを返す（以前と同じ）。接続 ID の索引（性能）は持たない。
 */
import { findParticipantByConnId, type Room, type ToolId } from "@tasuki/room-core";
import type { RoomStore } from "../ports/room-store.js";

/** 参加者として在席しているルーム（**ツールを問わない**）。どこにも居なければ `undefined`。 */
export function findRoomByConnId(store: Pick<RoomStore, "list">, connId: string): Room | undefined {
  return store.list().find((r) => findParticipantByConnId(r, connId) !== undefined);
}

/**
 * その接続が**そのツールとして**在席しているルーム。
 *
 * 接続 ID だけで引くと、別のツール（timer・ハブ）として在席している接続が、このツールを操作できてしまう
 * （お題の spec T4・ルーレットの spec R11 の 2 段目。1 段目は ws-adapter の振り分け）。
 */
export function findRoomByToolConnection(
  store: Pick<RoomStore, "list">,
  connId: string,
  tool: ToolId | null,
): Room | undefined {
  return store.list().find((r) => findParticipantByConnId(r, connId)?.connections.get(connId) === tool);
}
