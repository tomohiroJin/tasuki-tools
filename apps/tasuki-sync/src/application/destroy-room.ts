/**
 * ルーム破棄の共通経路（Issue #79）。
 *
 * ルームが消える契機は 2 つある。
 *
 *   1. アイドル回収 — 全員 offline のまま TTL を超えた（`room-reclaimer.ts`）
 *   2. 在室者が 0 人になる退出 — ソロの主催者が自分で抜けた（`command-handlers/participant-remove.ts`）
 *
 * どちらの契機でも、`store` からルームを消すだけでは足りない。自動交代の予約（`Scheduler`）・
 * お題生成の委譲（`ProblemDelegator`）・不在検知のタイマー（`PresenceManager`）・
 * ホスト/リジュームトークン（`token-store`）は、いずれも roomCode をキーにした
 * **別々の Map** で生きている。1 つでも取りこぼすと、既に存在しないルームに対して
 * タイマーが発火し続け、Map も解放されない。
 *
 * 契機ごとに後始末を並べ直すと、片方だけが更新されて必ずずれる。そこで後始末の
 * **内容と順序**をこの 1 箇所に固定し、2 つの契機は同じ関数を呼ぶだけにしてある。
 *
 * 順序は「発火しうるものを先に止め、最後に実体を消す」。先に `store.remove` すると、
 * 停止処理の途中でタイマーが発火したときに参照先を失ったルームを触りうる。
 */

import type { RoomStore } from "../ports/room-store.js";

export interface RoomDestroyerDeps {
  /** ルームの実体。破棄では `remove` しか使わないため必要な分だけを要求する。 */
  store: Pick<RoomStore, "remove">;
  /** サーバー権威タイマー。省略時は予約を持たない構成（テスト用の `makeHandlers` 単体など）。 */
  scheduler?: { clear(roomCode: string): void } | undefined;
  /** お題代表生成。省略時は委譲を持たない構成。 */
  delegator?: { cancel(roomCode: string): void } | undefined;
  /** 不在検知タイマー。`makeHandlers` は `PresenceManager` を知らないため省略可能にしてある。 */
  presence?: { clearRoomTimers(roomCode: string): void } | undefined;
  /** ホスト/リジュームトークンの解放（`makeHandlers` の `releaseRoom`）。 */
  releaseRoom: (roomCode: string) => void;
}

/** ルームを破棄する関数を組み立てる。返す関数は何度呼んでも安全（各解放は不在なら no-op）。 */
export function createRoomDestroyer(deps: RoomDestroyerDeps): (roomCode: string) => void {
  const { store, scheduler, delegator, presence, releaseRoom } = deps;

  return (roomCode: string): void => {
    scheduler?.clear(roomCode);
    delegator?.cancel(roomCode);
    presence?.clearRoomTimers(roomCode);
    releaseRoom(roomCode);
    store.remove(roomCode);
  };
}
