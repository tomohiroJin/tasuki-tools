/**
 * 混雑で入室を拒まれたときの次の一手（#147）。待ち時間を `@tasuki/sync-client` の `joinRetryDelayMs` で決め、
 * 分岐は純粋判断（`../join-retry-plan.ts` の `decideJoinRetry`）へ渡す。
 * 同期クライアントを読む側を同期フックの層に置くための分け方（層の向き・#592）。
 */
import { joinRetryDelayMs } from '@tasuki/sync-client';
import { decideJoinRetry, type JoinRetryPlan } from '../join-retry-plan';

/**
 * 次の一手を決める。
 *
 * @param previousAttempts これまでに試した回数（0 起点）
 * @param canRejoin 入り直すのに要る名前を持っているか
 * @param random 0 以上 1 未満を返す関数。テストから固定できるよう引数で受ける
 */
export function planJoinRetry(
  previousAttempts: number,
  canRejoin: boolean,
  random?: () => number,
): JoinRetryPlan {
  const attempt = previousAttempts + 1;
  return decideJoinRetry(attempt, joinRetryDelayMs(attempt, random), canRejoin);
}
