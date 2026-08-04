/**
 * NoAiProvider — AI なしで定型お題のみ返す
 * T025: FR-024
 */

import { pickFallback } from "@tdd-mob/core/problem";
import type { ProblemWithSource } from "@tdd-mob/core/problem";
import type { ProblemProvider } from "./provider.js";

export class NoAiProvider implements ProblemProvider {
  async generate(language: string, difficulty: string): Promise<ProblemWithSource> {
    return pickFallback(language, difficulty);
  }
}
