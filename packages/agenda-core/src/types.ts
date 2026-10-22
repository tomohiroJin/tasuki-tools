/**
 * 進行タイマーの型（#429）。長さはすべて秒または ms の整数。
 * 単調時計の値は state の中だけで使い、wire には載せない（送る時点で計った経過を載せる）。
 */

/** 時間切れの振る舞い。wait = 押すまで待つ・advance = 自動で次へ */
export type TimeoutBehavior = "wait" | "advance";

export interface StepInput {
  readonly name: string;
  readonly durationSec: number;
  readonly onTimeout: TimeoutBehavior;
}

export interface ScenarioInput {
  readonly title: string;
  readonly steps: readonly StepInput[];
  /** シナリオ全体を繰り返す回数。省略 = 1 */
  readonly rounds?: number | undefined;
}

export interface PlannedStep extends StepInput {
  /** "s-1", "s-2", …（置き換えの時点の並び順で採番） */
  readonly id: string;
  /** 何回目か（1 始まり） */
  readonly round: number;
  readonly skipped: boolean;
  /** 延長の合計（秒） */
  readonly extensionSec: number;
  /** 確定した所要（終えたら数値・飛ばしたら 0・まだなら null） */
  readonly spentMs: number | null;
}

export type AgendaPhase = "idle" | "running" | "paused" | "finished";

export interface AgendaState {
  readonly phase: AgendaPhase;
  readonly title: string;
  /** 繰り返しの回数（展開前の定義の回数） */
  readonly rounds: number;
  readonly steps: readonly PlannedStep[];
  readonly currentId: string | null;
  /** 単調時計。実時間の経過の基準 */
  readonly startedAt: number | null;
  /** 単調時計。いまのステップの所要の基準 */
  readonly stepStartedAt: number | null;
  /** 単調時計。計時が動いている間だけ値を持つ */
  readonly runningSince: number | null;
  /** いまのステップの計時の積算（一時停止で確定した分） */
  readonly accumulatedMs: number;
  /** 終了した時点の実時間の経過（確定値） */
  readonly finishedAtMs: number | null;
}

export type StepView = PlannedStep;

export interface AgendaView {
  readonly phase: AgendaPhase;
  readonly title: string;
  readonly rounds: number;
  readonly steps: readonly StepView[];
  readonly currentId: string | null;
  /** 実時間の経過（送る時点で計る） */
  readonly runElapsedMs: number;
  /** いまのステップの計時 */
  readonly stepTimerMs: number;
  /** いまのステップの所要 */
  readonly stepSpentMs: number;
}
