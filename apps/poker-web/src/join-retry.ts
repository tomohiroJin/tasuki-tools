/**
 * 入室が混雑で弾かれたときの再試行方針（#147）。
 *
 * #103 でレート制限が接続単位から **IP 単位**へ変わり、同一 NAT の利用者は
 * バケツを共有するようになった。バースト容量を超えて復帰した人は入室を拒まれ、
 * **接続済み・未入室のまま滞留する**（自分でリロードするまで復帰しない）。
 * ここはその人を自動で入室まで運ぶための待ち時間を決める。
 *
 * **ばらつき（ジッタ）が要る。** 同時に切れた N 人が同じ待ち時間で叩き直すと、
 * 何回繰り返しても同じ順位の人が弾かれ続け、待っても入れない人が残る。
 *
 * **上限が要る。** 無限に試み続けると、混雑が解消しない状況でバケツを
 * 消費し続けて自分たちを締め出す。尽きたら利用者へ手立てを示す。
 *
 * このファイルは `apps/timer-web/src/sync/join-retry.ts` と**同じ方針を持つ**。
 * 2 つの web の間に TypeScript を共有するパッケージが無いため写しているが、
 * 片側だけが変わっていないことは `e2e/tests/join-retry-policy.test.ts` が見る。
 */

/** 最初の待ち時間（ms）。 */
const INITIAL_DELAY_MS = 2000;
/** 待ち時間の上限（ms）。ばらつきの分だけこれを超えることがある。 */
const MAX_DELAY_MS = 30000;
/** 1 回ごとに待ち時間を何倍にするか。 */
const MULTIPLIER = 2;
/** ばらつきの幅。0.5 なら 0.5〜1.5 倍に散らす。 */
const JITTER_RATIO = 0.5;

/** 諦めるまでの試行回数。 */
export const JOIN_RETRY_MAX_ATTEMPTS = 6;

/**
 * `attempt` 回目（1 起点）の待ち時間（ms）。上限を超えた回は `null`（諦める）。
 *
 * @param random 0 以上 1 未満を返す関数。テストから固定できるよう引数で受ける
 */
export function joinRetryDelayMs(attempt: number, random: () => number = Math.random): number | null {
  if (attempt > JOIN_RETRY_MAX_ATTEMPTS) return null;
  const base = Math.min(INITIAL_DELAY_MS * Math.pow(MULTIPLIER, attempt - 1), MAX_DELAY_MS);
  return Math.round(base * (1 - JITTER_RATIO + random() * JITTER_RATIO * 2));
}
