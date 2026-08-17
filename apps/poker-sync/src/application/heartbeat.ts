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
 *
 * ## 標準（timer-sync）との差異 — 意図して残している（#165 PR-2）
 *
 * timer-sync は死活監視を `WsAdapter` の private に閉じ込めており（`missedPongs` も
 * private フィールド）、インタフェースを切り出していない。poker-sync は監視ループを
 * この application 層に置き、境界を {@link HeartbeatRegistry} で表している。その結果
 * **書き込み可能な `Map`（{@link HeartbeatRegistry.missedPongs}）を境界の外へ公開する**
 * 形になっており、カプセル化は timer-sync より弱い。
 *
 * 差異を承知で本 PR では動かさない。理由は 3 つある。
 *
 * 1. timer-sync の形へ寄せるのは構造変更で、**振る舞い不変**（本 PR の最上位制約）を
 *    壊しうる。
 * 2. インタフェースを `ports/` へ移すだけの案も採らない。`docs/adr/0004` 決定 1 が
 *    `ports/` に置けと定めているのは**ドメインへの依存**であり（同 ADR の決定 1 の
 *    文言を確認済み）、接続レジストリはそれに当たらない。標準とされる timer-sync も
 *    heartbeat のポートを持っていない。
 * 3. 設計正本（`docs/superpowers/specs/2026-08-17-poker-sync-ports-and-adapters-design.md`）の
 *    D2 は `ports/` を 4 本（RoomStore / MonotonicClock / IdGen / Broadcaster）と
 *    列挙し、D7 は**各ポートに差し替えテストを同じ PR で足す（MUST）**と定めている。
 *    ここを 5 本目のポートにすると、正本の変更と差し替えテストの追加が同時に要る。
 *
 * 恒久対応（監視をアダプタの内側へ畳む、または `missedPongs` の書き込みを
 * 関数で包む）は別 Issue の領分である。
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
