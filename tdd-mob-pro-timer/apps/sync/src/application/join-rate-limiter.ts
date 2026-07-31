/**
 * 接続単位のレート制限（`room.join` の連続失敗・コード/パスフレーズ総当たりの緩和）。
 *
 * `handlers.ts` の `makeHandlers` が抱えていた `joinFailures` Map と
 * `recentJoinFailures` ヘルパ・`JOIN_FAIL_WINDOW_MS`/`JOIN_FAIL_MAX` の定数を、
 * ロジックを変えずに1モジュールへ切り出したもの（フェーズ3・純粋な移動）。
 *
 * ★構造的な制約（申し送り事項）: この窓は `room.join` と `ai.unlock` の**両方**の
 * 失敗を積算する共有の防御である（`ai.unlock` は合言葉総当たり対策として同じ窓に
 * 相乗りしている）。`makeHandlers` は `createJoinRateLimiter()` を**1度だけ**呼び出し、
 * 生成した単一インスタンスを `handleRoomJoin` と `handleAiUnlock` の両クロージャへ
 * 共有させること。コマンドごとに別インスタンスを作ると、`ai.unlock` の総当たり対策が
 * 黙って弱まる（`room.join` 側の失敗が計上されなくなる）。
 * この関数はステートレスなファクトリであり、呼び出し側（`makeHandlers`）が
 * 生成回数を1回に保つ責務を持つ。共有が壊れていないことは
 * `apps/sync/test/join-rate-limiter.test.ts` の「room.join と ai.unlock の窓共有」
 * セクションで実サーバー相当の統合テストとして直接検証する。
 */

export interface JoinRateLimiter {
  /** `connId` の直近（窓内）の失敗時刻一覧を返す。窓外の記録は同時に掃除する。 */
  recentFailures(connId: string, now: number): number[];
  /** `connId` の失敗を1件記録する。 */
  recordFailure(connId: string, now: number): void;
  /** `connId` の失敗履歴を破棄する（接続クローズ時のリーク防止）。 */
  clear(connId: string): void;
}

export interface JoinRateLimiterOptions {
  /** 失敗をカウントする窓の長さ（ミリ秒）。 */
  windowMs: number;
  /** 窓内で許容する最大失敗回数。これに達すると呼び出し側が拒否する。 */
  max: number;
}

export function createJoinRateLimiter(
  options: JoinRateLimiterOptions,
): JoinRateLimiter {
  const { windowMs } = options;
  /** connId → 直近の失敗時刻（epoch ms） */
  const failures = new Map<string, number[]>();

  return {
    recentFailures(connId, now) {
      const arr = (failures.get(connId) ?? []).filter(
        (t) => now - t < windowMs,
      );
      if (arr.length === 0) failures.delete(connId);
      else failures.set(connId, arr);
      return arr;
    },
    recordFailure(connId, now) {
      failures.set(connId, [...(failures.get(connId) ?? []), now]);
    },
    clear(connId) {
      failures.delete(connId);
    },
  };
}
