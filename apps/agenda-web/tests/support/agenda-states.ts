/**
 * 盤の検査で使う状態の組み立て（#429）。agenda-core の公開関数だけで状態を作り、`toView` で写す。
 * 手で `AgendaView` を書くと「一時停止を挟んだ所要」のような値の組が実装と食い違いうるので、遷移を通す。
 */
import {
  INITIAL_AGENDA_STATE,
  advanceIfDue,
  extend,
  next,
  pause,
  replaceScenario,
  resume,
  setSkipped,
  start,
  toView,
  type AgendaState,
  type AgendaView,
  type StepInput,
  type TimeoutBehavior,
} from '@tasuki/agenda-core';

export const MIN = 60_000;

/** 失敗したら投げる（組み立ての誤りを黙って捨てない） */
function unwrap(r: { isOk(): boolean; _unsafeUnwrap(): AgendaState }): AgendaState {
  if (!r.isOk()) throw new Error('状態の組み立てに失敗しました');
  return r._unsafeUnwrap();
}

/** 名前と分の並びから、開始前の状態を作る（既定はすべて「押すまで待つ」） */
export function idleState(
  minutes: readonly number[],
  title = 'Retro',
  onTimeout: TimeoutBehavior = 'wait',
  rounds = 1,
): AgendaState {
  const steps: StepInput[] = minutes.map((m, i) => ({ name: `S${i + 1}`, durationSec: m * 60, onTimeout }));
  return unwrap(replaceScenario(INITIAL_AGENDA_STATE, rounds === 1 ? { title, steps } : { title, steps, rounds }));
}

/**
 * 時刻つきの台本で状態を進める小さな運転手。`at` は開始からの ms。
 * 返すのは状態と、最後に見た時刻（`view(ms)` でその時刻の写しを取る）。
 */
export class Driver {
  s: AgendaState;
  private readonly t0 = 1_000_000;
  constructor(minutes: readonly number[], title?: string, onTimeout: TimeoutBehavior = 'wait', rounds = 1) {
    this.s = unwrap(start(idleState(minutes, title, onTimeout, rounds), this.t0));
  }
  private now(at: number): number {
    return this.t0 + at;
  }
  next(at: number): this {
    this.s = unwrap(next(this.s, { stepId: this.s.currentId ?? '', now: this.now(at) }));
    return this;
  }
  pause(at: number): this {
    this.s = unwrap(pause(this.s, this.now(at)));
    return this;
  }
  resume(at: number): this {
    this.s = unwrap(resume(this.s, this.now(at)));
    return this;
  }
  extend(minutes: number): this {
    this.s = unwrap(extend(this.s, { stepId: this.s.currentId ?? '', minutes }));
    return this;
  }
  /** サーバーの期限の発火（「自動で次へ」の区切りを期限ちょうどで進める） */
  tick(at: number): this {
    this.s = advanceIfDue(this.s, this.now(at));
    return this;
  }
  skip(stepId: string, skipped = true): this {
    this.s = unwrap(setSkipped(this.s, { stepId, skipped }));
    return this;
  }
  view(at: number): AgendaView {
    return toView(this.s, this.now(at));
  }
}

/** 開始前の写し */
export function idleView(minutes: readonly number[], title?: string, rounds = 1): AgendaView {
  return toView(idleState(minutes, title, 'wait', rounds), 0);
}
