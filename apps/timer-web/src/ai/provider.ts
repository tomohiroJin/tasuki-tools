/**
 * ProblemProvider ポート
 * T025: FR-024
 */

import type { ProblemWithSource } from "@tdd-mob/core/problem";

export interface ProblemProvider {
  generate(language: string, difficulty: string): Promise<ProblemWithSource>;
}
