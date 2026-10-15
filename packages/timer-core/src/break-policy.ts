/**
 * 休憩の設定と判定（#402）。純粋関数だけを置く。
 *
 * 設定はルームの設定（`TimerConfig.break`）にある。無ければ「なし」と同じ。
 */
import type { Aggregate, TimerConfig } from "./aggregate.js";

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

const MS_PER_MINUTE = 60_000;

/**
 * 休憩に入る（自動）／知らせる（知らせるだけ）条件に達したか（#402 設計 §3.2）。
 *
 * - 経過時間: 前の基準からの稼働時間（一時停止中は数えない）が `every` 分に達したら
 * - 周回: 前の基準からの交代回数が「適格な席の数 × every」に達したら。適格な席が 1 つ以下なら偽
 *   （輪が 1 人だと交代回数が増えない。`evolveDriverSwitched` の現状維持）
 * - 知らせるだけのときの基準は、最後に知らせた時点（無ければ前の休憩）。知らせても休まなければ
 *   次の間隔ぶん経ってからもう一度知らせる（交代のたびには知らせない）
 *
 * `eligibleSeats` は呼ぶ側が名簿の在席から数えて渡す（集約は在席を知らない）。
 */
export function isBreakDue(agg: Aggregate, policy: BreakPolicy, eligibleSeats: number): boolean {
  const brk = agg.session.break;
  if (brk.since !== null) return false;
  const base = policy.mode === "suggest" ? (brk.suggestedAt ?? brk.baseline) : brk.baseline;
  switch (policy.trigger) {
    case "none":
      return false;
    case "elapsed":
      return agg.clock.accumulatedElapsedMs - base.elapsedMs >= policy.every * MS_PER_MINUTE;
    case "rounds":
      if (eligibleSeats <= 1) return false;
      return agg.session.totalSwitches - base.switches >= eligibleSeats * policy.every;
  }
}
