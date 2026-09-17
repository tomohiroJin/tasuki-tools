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
 * その設定のルームが、この phase に居るあいだロビーのお題を持つか。
 *
 * **捨てる側と埋める側は、この 1 つの判断を共有する**（#273）。
 * 捨てる側（`apply-room-level-event.ts` の `PhaseSet`）が「ここへ入ったら落とす」と
 * 見なす範囲と、埋める側（{@link fillLobbyProblem}）が「ここでは用意する」と見なす
 * 範囲がずれると、**落としたきり誰も埋めないロビー**ができる。
 *
 * **判断は 2 つあり、どちらか片方だけを共有しても足りない。**
 *
 *   1. **phase がロビー（開始前）であること。** 走っているセッションの足元で
 *      お題を差し替えない
 *   2. **そのルームがお題を使うこと**（`problemEnabled` は任意項目で既定は「使う」）。
 *      これは利用者がロビーで切り替えられる設定である（`Lobby.tsx` の
 *      `onConfigSet({ problemEnabled: v })`）
 *
 * 1 だけを共有していた形が、ちょうど行き止まりを作った（レビュー 2 巡目①）——
 * 「お題ありで走らせ、途中でお題を off にして完了し、新しいセッションにする」と、
 * 落とす側だけが動いて誰も埋めない。下流では `SessionCompleted` の
 * `if (room.problem)` が立たず、**2 本目の完成記録が作られなくなる**。
 *
 * `TimerState` ではなく設定と phase を別々に取るのは、**捨てる側が見たいのが
 * 「遷移先の phase」だから**である（そのときのルームはまだ `celebration` に居る）。
 */
export function usesLobbyProblem(
  config: TimerState["config"],
  phase: TimerState["phase"],
): boolean {
  if (config.problemEnabled === false) return false;
  return phase === "setup" || phase === "ready";
}

/** いまのルームがロビーのお題を持つ状態か（{@link usesLobbyProblem} を現在の状態で引く）。 */
function wantsLobbyProblem(timer: TimerState): boolean {
  return usesLobbyProblem(timer.config, timer.phase);
}

/**
 * ロビーのお題が未確定なら用意する（timer の状態が生まれた直後に呼ぶ）。
 *
 * **走っている委譲があれば触らない。** ここは参加のたびに通るので、張り直すと
 * 人が入るたびに AI 生成が中断されて始め直される。
 *
 * **`now` は requestId を一意にするためのもの**で、{@link regenerateLobbyProblem} と
 * 同じ理由で要る —— 古い委譲の応答を新しい依頼のものと取り違えないためである
 * （`ProblemDelegator` の stale 防御は requestId の文字列比較だけで、候補一致と
 * 合わせても**同じ ID・同じ候補なら通る**）。
 *
 * **固定文字列で足りていたのは #273 より前までである。** それまでロビーの依頼は
 * ルームの一生で 1 回しか起きなかった（`problem` が null へ戻る経路が無かった）。
 * #273 が「2 本目のロビーで再び null になる」経路を作ったので、同じ ID が
 * 別の依頼に二度使われうるようになった。期限に間に合わなかった 1 本目の応答は
 * 後から必ず飛ぶ（`apps/timer-web` の `handleNeedProblem` は deadline を見ずに
 * 投入する）ので、衝突すると 2 本目のロビーがそれを受け取ってしまう。
 *
 * **ここで時刻を読まない。** 呼び出し側が既に持っている `now` を渡すこと
 * （`handlers.ts` は `clock.now()`、入口のハンドラは `deps.clock.now()`）。
 */
export function fillLobbyProblem(
  delegator: ProblemDelegator | undefined,
  timer: TimerState,
  now: number,
): void {
  if (!delegator) return;
  if (timer.problem !== null) return;
  if (!wantsLobbyProblem(timer)) return;
  if (delegator.isRequesting(timer.code)) return;
  delegator.request(timer.code, `req-${timer.code}-lobby-${now}`);
}

/**
 * いま載っているお題が「いまのロビーのもの」でなくなったので、作り直す。
 *
 * **どういう変化がそれに当たるかは呼び出し側（`handlers.ts`）が判定する。**
 * ここに条件を書き写すと、増えたときに片側だけが古くなる（judgement は 1 箇所）。
 *
 * **こちらは走っている委譲を畳んで張り直す**（リロールと同じ・FR-027）。
 * 選び直しの途中で設定が変わったなら、新しい設定で選び直すのが正しい。
 * **裏返すと、呼ぶたびに AI 生成が中断される** —— 実際には変わっていない設定で
 * 呼ぶと、定型へ縮退したうえ日次枠を 1 消費する（`ai-limits.ts`・#283 の 3 点目）。
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
