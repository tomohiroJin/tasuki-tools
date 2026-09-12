/**
 * 指数バックオフ再接続（FR-019・T042）。
 *
 * **#95 S5a で `apps/timer-web/src/sync/` から移した**（D18）。切断のたびに待ち時間を
 * 倍にし、上限で頭打ちにする。確立できたら {@link ExponentialBackoff.reset} で戻す ——
 * 戻し忘れると、一度荒れた回線のクライアントが以後ずっと長く待つ。
 */

export interface BackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

const DEFAULT_OPTIONS: BackoffOptions = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
};

export class ExponentialBackoff {
  private attempt = 0;
  private readonly options: BackoffOptions;

  constructor(options: Partial<BackoffOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** 次の待機時間（ms）を返す */
  nextDelay(): number {
    const delay = Math.min(
      this.options.initialDelayMs * Math.pow(this.options.multiplier, this.attempt),
      this.options.maxDelayMs,
    );
    this.attempt++;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}
