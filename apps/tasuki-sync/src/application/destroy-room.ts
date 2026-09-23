/**
 * ルーム破棄の共通経路（Issue #79）。
 *
 * ルームが消える契機は 2 つある。**#95 S4a でこの 2 つが全部になった**（R10・D8）——
 * poker が持っていた「最後の接続が切れた瞬間に破棄する」経路（旧 FR-014）は撤去し、
 * 名簿が 1 つになったのに合わせて寿命の規則も 1 つに寄せた
 * （撤去の跡は `application/poker-handlers.ts` の `detachFromCurrentRoom` にある）。
 *
 *   1. アイドル回収 — 全員 offline のまま TTL を超えた（`room-reclaimer.ts`）
 *   2. 在室者が 0 人になる退出 — 名簿の最後の 1 人が抜けた（`command-handlers/participant-remove.ts`）
 *
 * どちらの契機でも、`store` からルームを消すだけでは足りない。自動交代の予約（`Scheduler`）・
 * お題生成の委譲（`ProblemDelegator`）・お題の生成（`TopicGenerator`・#91）・
 * 不在検知のタイマー（`PresenceManager`）・リジュームトークンとパスフレーズ（`token-store`）・
 * timer の状態（`TimerStore`）・poker のラウンド（`RoundStore`）・お題の状態（`TopicStore`）は、
 * いずれも roomCode をキーにした**別々の Map** で生きている。1 つでも取りこぼすと、既に存在しないルームに対してタイマーが発火し続け、
 * Map も解放されない。
 *
 * 契機ごとに後始末を並べ直すと、片方だけが更新されて必ずずれる。そこで後始末の
 * **内容と順序**をこの 1 箇所に固定し、2 つの契機は同じ関数を呼ぶだけにしてある。
 *
 * 順序は「発火しうるものを先に止め、最後に実体を消す」。先に `store.remove` すると、
 * 停止処理の途中でタイマーが発火したときに参照先を失ったルームを触りうる。
 * 実体（名簿と、各ツール・お題の状態）の削除はどれも同じ最後の段に置く ——
 * **これらは 1 つのルームの別の面**であり、間に別の処理を挟むと片面だけが消えた状態を
 * 外から観測されうるようになる。
 */

import type { RoomStore } from "../ports/room-store.js";
import type { TimerStore } from "../ports/timer-store.js";
import type { RoundStore } from "../ports/poker-round-store.js";
import type { TopicStore } from "../ports/topic-store.js";

export interface RoomDestroyerDeps {
  /** 名簿の実体。破棄では `remove` しか使わないため必要な分だけを要求する。 */
  store: Pick<RoomStore, "remove">;
  /** timer の状態の実体。**名簿と対で消す**（片方だけ残すと幽霊のルームができる・#95 S4a）。 */
  timers: Pick<TimerStore, "remove">;
  /**
   * poker のラウンドの実体。**名簿と対で消す**（`timers` と同じ規律・#95 S4a）。
   *
   * ⚠ **optional にしてはならない。** ここを省略可能にすると、本番の配線
   * （`create-sync-server.ts`）から `rounds` が落ちても全テストが緑のままになり、
   * 「名簿は消えたのにラウンドだけ残る」状態が静かに戻る。`HandlerDeps.destroyRoom` を
   * 必須へ戻したときと同じ理由である。**この関数は timer 文脈に置かれているが、
   * 寿命はツールごとではなくルームごとに 1 つ**なので、poker の保管もここが解放する。
   */
  rounds: Pick<RoundStore, "remove">;
  /**
   * お題の状態の実体（#91）。**名簿と対で消す**（`rounds` と同じ規律）。
   *
   * ⚠ **optional にしてはならない**（理由は {@link RoomDestroyerDeps.rounds} と同じ）。
   */
  topics: Pick<TopicStore, "remove">;
  /**
   * お題の生成（#91・`TopicGenerator`）。破棄で進行中の生成を中断する（子プロセスを止める）。
   *
   * ⚠ **optional にしてはならない。** `delegator` と違い省略時の構成を持たない ——
   * 省略可にすると、本番の配線から落ちても全テストが緑のまま、消えたルームの生成が
   * 走り続ける（子プロセスと AI の枠を握ったまま）。
   */
  topicGenerator: { cancel(roomCode: string): void };
  /** サーバー権威タイマー。省略時は予約を持たない構成（テスト用の `makeHandlers` 単体など）。 */
  scheduler?: { clear(roomCode: string): void } | undefined;
  /** お題代表生成。省略時は委譲を持たない構成。 */
  delegator?: { cancel(roomCode: string): void } | undefined;
  /** 不在検知タイマー。`makeHandlers` は `PresenceManager` を知らないため省略可能にしてある。 */
  presence?: { clearRoomTimers(roomCode: string): void } | undefined;
  /** リジュームトークンとパスフレーズの解放（`makeHandlers` の `releaseRoom`）。 */
  releaseRoom: (roomCode: string) => void;
}

/** ルームを破棄する関数を組み立てる。返す関数は何度呼んでも安全（各解放は不在なら no-op）。 */
export function createRoomDestroyer(deps: RoomDestroyerDeps): (roomCode: string) => void {
  const { store, timers, rounds, topics, scheduler, delegator, topicGenerator, presence, releaseRoom } =
    deps;

  return (roomCode: string): void => {
    scheduler?.clear(roomCode);
    delegator?.cancel(roomCode);
    // 生成の中断は保管の解放より先。中断した生成が消えたルームへ書き戻さないため
    // （`TopicGenerator#write` は状態が無ければ書かないが、子プロセスは止まらない）。
    topicGenerator.cancel(roomCode);
    presence?.clearRoomTimers(roomCode);
    releaseRoom(roomCode);
    store.remove(roomCode);
    timers.remove(roomCode);
    rounds.remove(roomCode);
    topics.remove(roomCode);
  };
}
