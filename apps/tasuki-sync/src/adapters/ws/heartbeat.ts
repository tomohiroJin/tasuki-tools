/**
 * サーバー主導の死活監視（Issue #25。#368 Task 5 で `ws-adapter.ts` から分けた）。
 *
 * 一定間隔で各接続に ping を送り、直前の送信から pong が来ていなければ欠落回数を加算する。
 * 欠落回数が閾値に達した接続は terminate し、既存の close 経路（presence の offline 化等）に
 * 処理を委ねる（DRY）。1 接続 1 interval あたり ping 送信は高々 1 回のため、通信量は接続数に対して線形。
 *
 * タイマーのポートは足さない。差し替えるテスト（`ws-adapter.heartbeat.test.ts`）は短い間隔の
 * 実時間で書けている（`docs/adr/0007` 追記 2026-08-17 の条件を満たさない）。
 */

/** ハートビート間隔の既定値（ms）。Issue #25: サーバー主導の死活監視。 */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
/** 許容する連続 pong 欠落回数の既定値。一時的な通信の揺れを吸収する猶予（US2）。 */
const DEFAULT_HEARTBEAT_MAX_MISSES = 2;

/** 死活監視が接続に求めるもの（`Bun.ServerWebSocket` の一部）。 */
export interface HeartbeatPeer {
  ping(): void;
  terminate(): void;
}

export interface HeartbeatOptions {
  /** ping の送信間隔（ms）。既定 15000。 */
  readonly intervalMs?: number | undefined;
  /** 連続でこの回数分 pong が確認できない接続を terminate する。既定 2。 */
  readonly maxMisses?: number | undefined;
}

export class Heartbeat {
  /** 接続ごとの「直近 ping 送信からの pong 未受信回数」。 */
  private readonly missedPongs = new Map<string, number>();
  private readonly intervalMs: number;
  private readonly maxMisses: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** `peers` は受理済みの接続の表（接続 ID → 接続）。持ち主は WS アダプタで、ここは読むだけ。 */
  constructor(
    private readonly peers: ReadonlyMap<string, HeartbeatPeer>,
    options: HeartbeatOptions,
  ) {
    // 呼び出し元（テスト等）が誤って 0 以下を明示指定しても busy-loop 化しないよう、
    // config.ts の intEnv と同じ契約（正の整数）をここでも守る（DbC）。
    this.intervalMs = Math.max(1, options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.maxMisses = Math.max(0, options.maxMisses ?? DEFAULT_HEARTBEAT_MAX_MISSES);
  }

  /** 受理した接続を数え始める。 */
  track(connId: string): void {
    this.missedPongs.set(connId, 0);
  }

  /** pong 受信 = 生存確認。欠落カウントをリセットする（一時的な揺れからの復帰・US2）。 */
  pong(connId: string): void {
    this.missedPongs.set(connId, 0);
  }

  /** 閉じた接続を忘れる。 */
  forget(connId: string): void {
    this.missedPongs.delete(connId);
  }

  start(): void {
    this.timer = setInterval(() => {
      for (const [connId, peer] of this.peers) {
        const missed = this.missedPongs.get(connId) ?? 0;
        if (missed >= this.maxMisses) {
          peer.terminate();
          continue;
        }
        this.missedPongs.set(connId, missed + 1);
        peer.ping();
      }
    }, this.intervalMs);
    // 定期タイマーだけでプロセスの終了を妨げないようにする（テスト・グレースフルシャットダウン考慮）。
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
