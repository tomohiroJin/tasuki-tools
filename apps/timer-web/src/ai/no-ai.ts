/**
 * NoAiProvider — AI なしで定型お題のみ返す
 * T025: FR-024
 */

import { pickFallback } from "@tasuki/timer-core/problem";
import type { ProblemWithSource } from "@tasuki/timer-core/problem";
import type { Problem } from "@tasuki/timer-core";
import type { ProblemProvider } from "./provider.js";

export class NoAiProvider implements ProblemProvider {
  async generate(
    language: string,
    difficulty: string,
    previous: Problem | null,
  ): Promise<ProblemWithSource> {
    // ここが時刻の境界である。`ProblemProvider` はポートで、この class はそのアダプタなので
    // 実時刻の読み取りはここに置く（憲法 原則 VI・#166 / #72 E3）。
    // ドメイン（`pickFallback`）は値だけを受け取り、`Date.now()` を呼ばない。
    //
    // 直前のお題もそのまま渡す（#283 のレビュー）。**この経路は本番では走らない**
    // （実クライアントは常に `hasAiKey: false` を送るので代表に選ばれない）が、
    // 片側だけ直すと、この経路が生き返ったときに同じ欠陥が戻る。
    return pickFallback(language, difficulty, Date.now(), previous);
  }
}
