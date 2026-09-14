/**
 * AI お題生成の「生成中」フラグを下ろすべきか判定する純関数。
 * 生成中で、かつ snapshot のお題が前回から内容変化（title または source）したら true。
 * 参照比較は使わない（presence 更新などお題に無関係な snapshot で room が
 * 新規オブジェクトになっても誤解除しないため）。null→problem の初回確定も変化とみなす。
 */
import type { Problem } from "@tasuki/timer-core";

export function shouldClearGenerating(
  generating: boolean,
  prevProblem: Problem | null,
  nextProblem: Problem | null,
): boolean {
  if (!generating) return false;
  if (prevProblem === null && nextProblem === null) return false;
  if (prevProblem === null || nextProblem === null) return true; // 片方だけ null＝確定/消失
  return prevProblem.title !== nextProblem.title || prevProblem.source !== nextProblem.source;
}

/**
 * ロビーでの代表お題自動生成を送るべきか（判定を画面から分離してテスト可能化）。
 *
 * **依頼するのは輪の先頭の人ただ 1 人である**（#95 S5c・R9）。全員が送ると、
 * サーバーの委譲（`ProblemDelegator.request`）が同じ requestId で何度も張り直される。
 *
 * 撤去前の条件は「このクライアントがルームを作った側か（`isCreator`）」だった。
 * **ルームを作るのがハブになった時点でその条件は誰にも成り立たなくなり、
 * ロビーのお題が永久に出ない（＝「セッションを開始」が押せない）状態だった**
 * —— 旧入口が生きている間は timer 自身が作成者を持っていたため、E2E も含めて
 * 誰もその経路を通っていなかった（#95 S5c の実測で判明）。
 *
 * ## 付け替えで変わった性質（3 つ）
 *
 * 選ばれる人は**ふつうは同じ人**である —— timer の状態は最初にその道具へ入った人が作り、
 * その人が唯一の席に着く（`apps/tasuki-sync/src/application/initial-timer-state.ts`）。
 * ただし**同じ規則を言い換えただけではない。**
 *
 * 1. **判定の源が共有状態になった。** 旧 `isCreator` はクライアント局所のフラグで、
 *    他人の操作では動かなかった。輪の先頭は snapshot が運ぶ共有の値なので、
 *    ロビー中に `member.move` / `member.shuffle` で先頭が入れ替われば**代表も入れ替わる**
 * 2. **重複依頼が起こりうる。** 「もう依頼したか」（`problemRequested`）はクライアント局所の
 *    ままなので、並び替えの直後に新しい先頭が同じ `req-<CODE>-lobby` をもう一度送りうる
 * 3. **同じ `participantId` で 2 タブ開いている端末は、両方が代表になる**
 *    （旧 `isCreator` は作成したタブだけだった）
 *
 * **2 と 3 の重複は許容してよい。** サーバーは `problem.request` を受けると
 * `ProblemDelegator.request(code, requestId)` を呼び、**旧依頼をキャンセルしてから
 * 委譲し直す**（`apps/tasuki-sync/src/application/command-handlers/problem-request.ts` の
 * FR-027）。同じ requestId が続けて届いても、走る委譲は常に 1 本で、お題も 1 つに収束する。
 * 全員が無条件に送る形にしなかったのは、その張り直しを人数ぶん起こさないためであって、
 * 1 件や 2 件の重複が壊れるからではない。
 */
export function shouldAutoRequestProblem(args: {
  phase: string;
  hasProblem: boolean;
  isRepresentative: boolean;
  alreadyRequested: boolean;
  problemEnabled: boolean;
}): boolean {
  const { phase, hasProblem, isRepresentative, alreadyRequested, problemEnabled } = args;
  if (!problemEnabled) return false;
  if (phase !== "setup" && phase !== "ready") return false;
  return !hasProblem && isRepresentative && !alreadyRequested;
}

/**
 * 自分が輪の先頭か（お題の依頼を送る代表かどうか・#95 S5c・R9）。
 *
 * `participantId` が未確定（identity 未受信）の間は偽になる。**空文字と空の輪を
 * 突き合わせて真にしない**ため、先に空を弾く。
 */
export function isRotationRepresentative(participantId: string, rotation: readonly string[]): boolean {
  if (participantId === "") return false;
  return rotation[0] === participantId;
}
