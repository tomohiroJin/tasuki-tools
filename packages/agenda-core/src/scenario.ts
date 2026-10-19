import type { PlannedStep, ScenarioInput } from "./types.js";

/** 定義を実行用のステップへ展開する。ID は並び順で `s-1` から採番する（置き換えのたびに振り直す）。 */
export function expand(input: ScenarioInput): PlannedStep[] {
  return input.steps.map((step, i) => ({
    id: `s-${i + 1}`,
    name: step.name,
    durationSec: step.durationSec,
    onTimeout: step.onTimeout,
    skipped: false,
    extensionSec: 0,
    spentMs: null,
  }));
}

/** 予定の合計（秒）。延長は含めない。 */
export function totalPlannedSec(steps: readonly PlannedStep[]): number {
  return steps.reduce((sum, s) => sum + s.durationSec, 0);
}
