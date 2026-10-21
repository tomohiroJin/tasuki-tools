import type { PlannedStep, ScenarioInput, StepInput } from "./types.js";

/** 回数。省略は 1。 */
export function roundsOf(input: Pick<ScenarioInput, "rounds">): number {
  return input.rounds ?? 1;
}

/** 定義を実行用のステップへ展開する。回数ぶん steps を写して並べ、ID は通しで `s-1` から採番する（置き換えのたびに振り直す）。 */
export function expand(input: ScenarioInput): PlannedStep[] {
  const rounds = roundsOf(input);
  const out: PlannedStep[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (const step of input.steps) {
      out.push({
        id: `s-${out.length + 1}`,
        round,
        name: step.name,
        durationSec: step.durationSec,
        onTimeout: step.onTimeout,
        skipped: false,
        extensionSec: 0,
        spentMs: null,
      });
    }
  }
  return out;
}

/**
 * 予定の合計（秒）。延長は含めない。展開前の入力（`StepInput`）でも展開後（`PlannedStep`）でも数える
 * （境界のスキーマの合計の上限と、画面の分の合計が同じ数え方を使う）。回数は掛けない（1 回あたり）。
 */
export function totalPlannedSec(steps: readonly Pick<StepInput, "durationSec">[]): number {
  return steps.reduce((sum, s) => sum + s.durationSec, 0);
}

/** 回数を掛けた予定の合計（秒）。 */
export function scenarioTotalSec(input: ScenarioInput): number {
  return totalPlannedSec(input.steps) * roundsOf(input);
}

/** 展開後の区切りの数。 */
export function plannedStepCount(input: ScenarioInput): number {
  return input.steps.length * roundsOf(input);
}

/**
 * 展開済みの形から定義を組み直す（1 回目の区切りの名前・長さ・振る舞いと回数）。
 * 回数 1 のときは `rounds` キーを持たない（回数なしの定義と同じ形）。
 */
export function definitionOf(v: { title: string; rounds: number; steps: readonly PlannedStep[] }): ScenarioInput {
  const steps = v.steps
    .filter((s) => s.round === 1)
    .map((s): StepInput => ({ name: s.name, durationSec: s.durationSec, onTimeout: s.onTimeout }));
  return v.rounds === 1 ? { title: v.title, steps } : { title: v.title, steps, rounds: v.rounds };
}
