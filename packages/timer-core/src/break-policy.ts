/**
 * 休憩の設定と判定（#402）。純粋関数だけを置く。
 *
 * 設定はルームの設定（`TimerConfig.break`）にある。無ければ「なし」と同じ。
 */
import type { TimerConfig } from "./aggregate.js";

export const BREAK_TRIGGERS = ["none", "elapsed", "rounds"] as const;
export type BreakTrigger = (typeof BREAK_TRIGGERS)[number];
export const BREAK_MODES = ["auto", "suggest"] as const;
export type BreakMode = (typeof BREAK_MODES)[number];
/** 経過時間の条件の選択肢（分） */
export const BREAK_ELAPSED_MINUTES = [30, 45, 60, 90] as const;
/** 周回の条件の選択肢（周） */
export const BREAK_ROUNDS = [1, 2, 3, 4] as const;
/** 条件を選んだときの既定の間隔 */
export const DEFAULT_BREAK_EVERY = { elapsed: 60, rounds: 2 } as const;

export interface BreakPolicy {
  trigger: BreakTrigger;
  /** elapsed なら分、rounds なら周。none では読まない */
  every: number;
  mode: BreakMode;
}

const NO_BREAK: BreakPolicy = { trigger: "none", every: 0, mode: "auto" };

/** `every` が条件ごとの選択肢に入っているか。none は `every` を問わない */
export function isValidBreakPolicy(p: BreakPolicy): boolean {
  switch (p.trigger) {
    case "none":
      return true;
    case "elapsed":
      return (BREAK_ELAPSED_MINUTES as readonly number[]).includes(p.every);
    case "rounds":
      return (BREAK_ROUNDS as readonly number[]).includes(p.every);
  }
}

export function breakPolicyOf(config: TimerConfig): BreakPolicy {
  return config.break ?? NO_BREAK;
}
