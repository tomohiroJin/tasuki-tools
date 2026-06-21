/**
 * AI お題生成の「生成中」フラグを下ろすべきか判定する純関数。
 * 生成中で、かつ snapshot のお題が前回から内容変化（title または source）したら true。
 * 参照比較は使わない（presence 更新などお題に無関係な snapshot で room が
 * 新規オブジェクトになっても誤解除しないため）。null→problem の初回確定も変化とみなす。
 */
import type { Problem } from "@tdd-mob/core";

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

/** ロビーでの代表お題自動生成を送るべきか（App の effect から判定を分離してテスト可能化）。 */
export function shouldAutoRequestProblem(args: {
  phase: string;
  hasProblem: boolean;
  isCreator: boolean;
  alreadyRequested: boolean;
  problemEnabled: boolean;
}): boolean {
  const { phase, hasProblem, isCreator, alreadyRequested, problemEnabled } = args;
  if (!problemEnabled) return false;
  if (phase !== "setup" && phase !== "ready") return false;
  return !hasProblem && isCreator && !alreadyRequested;
}
