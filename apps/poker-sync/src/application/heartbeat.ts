/**
 * サーバー主導の死活監視（Issue #63。timer の #25 と同じ設計）。
 *
 * 一定間隔で各接続へ ping を送り、前回の送信から pong が返っていなければ欠落を数える。
 * 閾値に達した接続は terminate し、あとの処理は通常の close 経路
 * （参加者の disconnected 化・ホスト繰上・自動公開の再評価）に委ねる。
 *
 * 半開き接続（TCP は生きているが相手が応答しない）は close イベントが発生しないため、
 * これが無いと参加者は connected のまま残り続ける。
 *
 * **接続レジストリは WS アダプタが持つ。** ここはそれを読み書きするだけで、
 * Bun の型も `Bun.serve` も知らない（{@link HeartbeatRegistry}）。
 */

/** 死活監視が 1 接続に求める操作。`Bun.ServerWebSocket` は構造的にこれを満たす。 */
export interface HeartbeatConnection {
  ping(): void;
  terminate(): void;
}

/** 死活監視が接続レジストリに求めるもの。`adapters/ws-adapter.ts` が満たす。 */
export interface HeartbeatRegistry {
  /** 受理済みの接続（connId → 接続）。 */
  readonly connections: ReadonlyMap<string, HeartbeatConnection>;
  /**
   * 接続ごとの「直近 ping 送信からの pong 未受信回数」。
   * pong の受信で 0 に戻すのはアダプタ側なので、書き込み可能な参照を共有する。
   */
  readonly missedPongs: Map<string, number>;
}

/** 死活監視が設定に求めるもの（`PokerSyncConfig` の部分集合）。 */
export interface HeartbeatConfig {
  heartbeatIntervalMs: number;
  heartbeatMaxMisses: number;
}

/**
 * 死活監視を開始し、**止める関数を返す**。
 *
 * 返り値があるのは、同一プロセスでサーバーを何度も起動し直すテストのためである。
 * 放置すると、閉じたはずのサーバーのタイマーが後から発火する。
 * 本番は起動後に止めないので、返り値を使わなくても振る舞いは変わらない。
 */
export function startHeartbeat(
  registry: HeartbeatRegistry,
  config: HeartbeatConfig,
): () => void {
  const timer = setInterval(() => {
    for (const [connId, ws] of registry.connections) {
      const missed = registry.missedPongs.get(connId) ?? 0;
      if (missed >= config.heartbeatMaxMisses) {
        ws.terminate();
        continue;
      }
      registry.missedPongs.set(connId, missed + 1);
      ws.ping();
    }
  }, config.heartbeatIntervalMs);
  // 定期タイマーだけでプロセスの終了を妨げないようにする
  timer.unref?.();
  return () => clearInterval(timer);
}
