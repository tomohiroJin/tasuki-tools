/**
 * 指数バックオフ再接続（FR-019・T042）。
 *
 * **#95 S5a で `apps/timer-web/src/sync/` から移した**（D18）。切断のたびに待ち時間を
 * 倍にし、上限で頭打ちにする。確立できたら {@link ExponentialBackoff.reset} で戻す ——
 * 戻し忘れると、一度荒れた回線のクライアントが以後ずっと長く待つ。
 *
 * ⚠ **既定値はここに 1 つあるが、利用側が上書きできる。** 下の既定（1 秒 / 上限 30 秒）は
 * timer とハブの値である。**poker は公開以来 500ms / 上限 5 秒**で、#95 S5b で接続の実装を
 * このパッケージへ寄せたときも値は保った（`apps/poker-web/src/hooks/useSync.ts`）——
 * 実装を共有することと、利用者が体感する待ち時間を変えることは別の判断だからである。
 * **どちらに揃えるか（あるいは分けたままにするか）は、根拠を測ってから別途決める。**
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
