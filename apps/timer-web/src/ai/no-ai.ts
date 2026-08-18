/**
 * NoAiProvider — AI なしで定型お題のみ返す
 * T025: FR-024
 */

import { pickFallback } from "@tasuki/timer-core/problem";
import type { ProblemWithSource } from "@tasuki/timer-core/problem";
import type { ProblemProvider } from "./provider.js";

export class NoAiProvider implements ProblemProvider {
  async generate(language: string, difficulty: string): Promise<ProblemWithSource> {
    // ここが時刻の境界である。`ProblemProvider` はポートで、この class はそのアダプタなので
    // 実時刻の読み取りはここに置く（憲法 原則 VI・#166 / #72 E3）。
    // ドメイン（`pickFallback`）は値だけを受け取り、`Date.now()` を呼ばない。
    return pickFallback(language, difficulty, Date.now());
  }
}
