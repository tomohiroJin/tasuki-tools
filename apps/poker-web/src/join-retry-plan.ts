/**
 * 混雑で入室を拒まれたときに次へ何をするかの決め方（#147）。
 *
 * **判定をここへ切り出しているのは、`RoomPage` の効果に埋めるとテストできないため。**
 * このパッケージには React の描画テスト環境が無いので、決め方だけを純粋関数にして
 * 単体テストへ載せる（`connection-notice.ts` と同じ形）。
 *
 * 待ち時間そのものは `join-retry.ts`（timer 側と同じ方針の写し）が決める。
 */
import { joinRetryDelayMs } from './join-retry';

/** 入り直せるときの案内。 */
export const RETRY_WAITING_TEXT = '混み合っています。自動で入り直しています…';
/**
 * 入り直せないときの案内。
 *
 * **「自動で入り直しています」とは言わない。** 招待リンクで来て名前をまだ入れて
 * いない人については、こちらは送り直す名前を持っていない。持っていないのに
 * 「入り直している」と出すと、画面の言うことが嘘になる。
 */
export const RETRY_WAITING_WITHOUT_NAME_TEXT = '混み合っています。少し待ってからお試しください';
/** 試行を使い切ったときの案内。 */
export const RETRY_EXHAUSTED_TEXT = '混雑が続いています。時間をおいてから再読込してください';

export type JoinRetryPlan =
  | { kind: 'wait'; attempt: number; delayMs: number; notice: string }
  | { kind: 'give-up'; notice: string };

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
  const delayMs = joinRetryDelayMs(attempt, random);
  // 使い切ったら諦める。**際限なく送り続けると、混雑が解消しない状況で
  // バケツを消費し続けて自分たちを締め出す。**
  if (delayMs === null) return { kind: 'give-up', notice: RETRY_EXHAUSTED_TEXT };
  return {
    kind: 'wait',
    attempt,
    delayMs,
    notice: canRejoin ? RETRY_WAITING_TEXT : RETRY_WAITING_WITHOUT_NAME_TEXT,
  };
}
