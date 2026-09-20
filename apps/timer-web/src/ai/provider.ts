/**
 * ProblemProvider ポート
 * T025: FR-024
 */

import type { ProblemWithSource } from "@tasuki/timer-core/problem";
// `Problem` は `/problem` のサブパスからは出ていない（実体は `aggregate`）。
// 画面側が既に使っている index 経由で取り込む（`ui/components/ProblemEditor.tsx` と同じ）。
import type { Problem } from "@tasuki/timer-core";

export interface ProblemProvider {
  /**
   * @param previous いま載っているお題（無ければ `null`）。定型バンクから選ぶ実装は
   *   これを候補から外す（#283 のレビュー）。**任意にしない** —— 任意にすると
   *   呼び出し側が無変更で通り、配線されていないことが検査に出ない。
   */
  generate(
    language: string,
    difficulty: string,
    previous: Problem | null,
  ): Promise<ProblemWithSource>;
}
