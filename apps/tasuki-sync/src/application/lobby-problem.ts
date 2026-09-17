/**
 * ロビーのお題を用意する側（#271）。
 *
 * **お題の依頼はサーバーが起こす。** #249（#95 S5c）まではクライアントの「代表」が
 * 送っていた —— 最初は「ルームを作った側」、S5c 以降は「輪の先頭」である。
 * どちらも**その人が timer に居ること**を前提にしていたが、輪は切断では変わらない
 * （`presence.ts` の `handleDisconnect` は名簿の接続だけを外す）。入口が玄関 1 つに
 * なってツール間の行き来が常態になると、輪の先頭が timer に居ない状態が普通に起きる。
 * そのとき誰も依頼を送らず、ロビーが行き止まりになっていた。
 *
 * **`problem: null` を作っているのはこちら側である**（`initial-timer-state.ts` が
 * 唯一の書き手）。埋める責任も同じ側に置く —— クライアントに代表を置く限り、
 * 在席していない人に依頼を期待する構造が残る。
 */

import type { TimerState } from "@tasuki/timer-core";
import type { ProblemDelegator } from "./problem-delegation.js";

/**
 * ロビー（セッション開始前）を表す phase か。
 *
 * **捨てる側と埋める側で定義が割れないよう、ここ 1 箇所が持つ**（#273）。
 * 捨てる側（`apply-room-level-event.ts` の `PhaseSet`）が「ロビーへ入った」と見なす
 * 範囲と、埋める側（{@link fillLobbyProblem}）が「お題を用意する」範囲がずれると、
 * **落としたきり誰も埋めないロビー**ができる（片方だけ `ready` を含めた形が
 * ちょうどそれになる）。1 行の重複だが、ずれた側が行き止まりを作るので共有する。
 */
export function isLobbyPhase(phase: TimerState["phase"]): boolean {
  return phase === "setup" || phase === "ready";
}

/**
 * お題を使うルームか（`problemEnabled` は任意項目で、既定は「使う」）。
 *
 * **ロビー（開始前）だけを見る。** 走っているセッションの足元でお題を差し替えない。
 */
function wantsLobbyProblem(timer: TimerState): boolean {
  if (timer.config.problemEnabled === false) return false;
  return isLobbyPhase(timer.phase);
}

/**
 * ロビーのお題が未確定なら用意する（timer の状態が生まれた直後に呼ぶ）。
 *
 * **走っている委譲があれば触らない。** ここは参加のたびに通るので、張り直すと
 * 人が入るたびに AI 生成が中断されて始め直される。
 */
export function fillLobbyProblem(
  delegator: ProblemDelegator | undefined,
  timer: TimerState,
): void {
  if (!delegator) return;
  if (timer.problem !== null) return;
  if (!wantsLobbyProblem(timer)) return;
  if (delegator.isRequesting(timer.code)) return;
  delegator.request(timer.code, `req-${timer.code}-lobby`);
}

/**
 * 言語・難易度が変わったので、ロビーのお題を作り直す。
 *
 * **こちらは走っている委譲を畳んで張り直す**（リロールと同じ・FR-027）。
 * 選び直しの途中で設定が変わったなら、新しい設定で選び直すのが正しい。
 * `now` は requestId を一意にするためのもので、古い委譲の応答を新しい依頼の
 * ものと取り違えないために要る（`ProblemDelegator` の stale 防御）。
 */
export function regenerateLobbyProblem(
  delegator: ProblemDelegator | undefined,
  timer: TimerState,
  now: number,
): void {
  if (!delegator) return;
  if (!wantsLobbyProblem(timer)) return;
  delegator.request(timer.code, `req-${timer.code}-cfg-${now}`);
}
