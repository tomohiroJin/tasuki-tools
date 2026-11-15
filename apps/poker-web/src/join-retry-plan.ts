/**
 * 混雑で入室を拒まれたときに次へ何をするかの決め方（#147）。
 *
 * **判定をここへ切り出しているのは、待ち方の分岐を描画から切り離すため。**
 * 切り出した当初の理由は「このパッケージに React の描画テスト環境が無いこと」だったが、
 * **その環境は #205 で入った**（`vitest.config.ts` の jsdom）。それでも切り出しは残す。
 * 分岐の網羅はここの単体テストが安く見られ、描画側は配線だけを見ればよくなるからで、
 * `connectionNoticeKind`（`@tasuki/sync-client`）と同じ形である。配線は `tests/room-page-join-retry.test.tsx` が見る。
 *
 * 待ち時間そのものは `@tasuki/sync-client` の `joinRetryDelayMs` が決める
 * （#95 S5b で写しをやめ、ハブ・timer と同じ 1 つになった）。**その呼び出しは同期フック側の
 * `hooks/plan-join-retry.ts`**（純粋判断は同期クライアントを読まない・#592）。ここは待ち時間が出たあとの分岐だけを持つ。
 */
/** 入り直せるときの案内。 */
export const RETRY_WAITING_TEXT = '混み合っています。自動で入り直しています…';
/**
 * 入り直せないときの案内。
 *
 * **「自動で入り直しています」とは言わない。** 送り直す名前を持っていないのに
 * 「入り直している」と出すと、画面の言うことが嘘になる。
 *
 * **名前を持たない人の出どころは #95 S5c で変わった。** 撤去前は「招待リンクで来て、
 * まだ名前を入れていない人」だった。旧入口を撤去したいま、名乗っていない人はそもそも
 * ルーム画面へ来ない（玄関の参加画面へ送り返される）。残るのは**持っていた名乗りを
 * 失う経路**で、同じ端末の別のタブが消滅したルームのトークンを捨てると起きる
 * （`localStorage` は同じオリジンで共有される・`hooks/useRoomEntry.ts` の `forgetIdentity`）。
 */
export const RETRY_WAITING_WITHOUT_NAME_TEXT = '混み合っています。少し待ってからお試しください';
/** 試行を使い切ったときの案内。 */
export const RETRY_EXHAUSTED_TEXT = '混雑が続いています。時間をおいてから再読込してください';

export type JoinRetryPlan =
  | { kind: 'wait'; attempt: number; delayMs: number; notice: string }
  | { kind: 'give-up'; notice: string };

/**
 * 待ち時間が決まったあとの一手を決める。
 *
 * @param attempt これから数える試行の番号（1 起点）
 * @param delayMs 待ち時間。使い切った（もう試さない）ときは null
 * @param canRejoin 入り直すのに要る名前を持っているか
 */
export function decideJoinRetry(attempt: number, delayMs: number | null, canRejoin: boolean): JoinRetryPlan {
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
