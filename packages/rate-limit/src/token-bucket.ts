/**
 * 失敗回数のレート制限（トークンバケツ）。
 *
 * ## なぜ窓ではなくバケツか
 *
 * 窓（直近 N 秒の失敗回数）は、持続レートとバースト耐性を 1 つの数で表してしまう。
 * 「10 回 / 10 秒」は持続 1 回/秒を意味すると同時に、瞬間的な 10 件超の集中も禁じる。
 * 同一 NAT 配下の複数人が一斉に再接続すると、正規利用者が締め出される。
 * バケツなら持続レート（補充速度）とバースト耐性（容量）を独立に決められる
 * （設計正本 `2026-08-14-ip-rate-limit-design.md` D2）。
 *
 * ## 呼び出しの順序（重要）
 *
 * **`shouldReject` → 資源の照会 → `consume`** の順で使うこと。照会してから判定すると、
 * バケツが空のときに「見つからない」という応答が返り、**攻撃者はトークンを消費せずに
 * 存在確認を続けられる**（レート制限が無意味になる）。判定と消費を別の関数に分けて
 * あるのは、この順序を呼び出し側が選べないようにするためではなく、
 * **順序を明示的に書かせるため**である（設計正本 D3）。
 *
 * ## 保持するもの
 *
 * 鍵ごとに残量と最終更新時刻の 2 値だけ。タイムスタンプの配列は持たない。
 *
 * ## なぜ `now` を引数で受けるのか
 *
 * `Date.now()` を内部で直接呼ばない。憲法 原則 VI（依存は内向き）に従い、実時間への
 * 依存は呼び出し側（adapter）に閉じ込め、この関数は純粋な入出力で振る舞う。
 * テストが `setInterval` や `sleep` を必要としないのはこのため。
 */

/** 鍵ごとの残量。`updatedAt` からの経過時間で補充量を後から計算する（遅延評価）。 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiter {
  /** 残量が 1 未満なら true。**資源を照会する前に呼ぶこと。** */
  shouldReject(key: string, now: number): boolean;
  /** 失敗が確定したときだけ呼ぶ。トークンを 1 つ消費する。 */
  consume(key: string, now: number): void;
  /** 満タンに戻ったエントリを捨てる。 */
  sweep(now: number): void;
  /** 保持しているエントリ数（検査・テスト用）。 */
  size(): number;
  /** `sweep` が実際に全走査した回数（検査・テスト用）。 */
  sweepRunCount(): number;
}

export interface TokenBucketOptions {
  /** 瞬間的に許す失敗の件数。 */
  capacity: number;
  /** 1 秒あたりの補充数 = 持続レート。 */
  refillPerSec: number;
  /** この件数を超えたときだけ掃除を検討する。既定は `DEFAULT_SWEEP_THRESHOLD`（値の正本は設計正本 D4）。 */
  sweepThreshold?: number;
}

/** 既定の容量。値の正本は設計正本 `2026-08-14-ip-rate-limit-design.md` D2。 */
export const DEFAULT_CAPACITY = 60;
/** 既定の補充速度（＝持続レート）。値の正本は同上。 */
export const DEFAULT_REFILL_PER_SEC = 1;
/** 既定の掃除しきい値。値の正本は設計正本 `2026-08-14-ip-rate-limit-design.md` D4。 */
export const DEFAULT_SWEEP_THRESHOLD = 1_000;

export function createTokenBucketLimiter(options: TokenBucketOptions): RateLimiter {
  const { capacity, refillPerSec } = options;
  const sweepThreshold = options.sweepThreshold ?? DEFAULT_SWEEP_THRESHOLD;

  // capacity・refillPerSec・sweepThreshold は起動時に決まる設定であり、実行時に利用者の
  // 入力から変わることはない。ここでの不正値は設定ミスなので、実行時の防御（拒否側へ倒す）
  // ではなく、起動時に throw して早期に気づけるようにする。
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error(`createTokenBucketLimiter: capacity は有限の正数にすること（渡された値: ${capacity}）`);
  }
  if (!Number.isFinite(refillPerSec) || refillPerSec <= 0) {
    throw new Error(
      `createTokenBucketLimiter: refillPerSec は有限の正数にすること（渡された値: ${refillPerSec}）`,
    );
  }
  // sweepThreshold は 0 も有効（毎回サイズ条件を満たす、という意味のある設定）なので、
  // capacity・refillPerSec と異なり下限は `<= 0` ではなく `< 0` にする。
  if (!Number.isFinite(sweepThreshold) || sweepThreshold < 0) {
    throw new Error(
      `createTokenBucketLimiter: sweepThreshold は有限かつ 0 以上の数値にすること（渡された値: ${sweepThreshold}）`,
    );
  }

  /** 空から満タンへ戻るのに要する時間。掃除の最小間隔にも使う。 */
  const refillFullMs = (capacity / refillPerSec) * 1_000;
  // capacity・refillPerSec は個別には正常でも、商（refillFullMs）はオーバーフローで
  // Infinity に、アンダーフローで 0 になりうる（I-2）。Infinity だと掃除の間隔条件が
  // 永久に成立せず掃除が死に、0 だと毎 consume が O(n) の全走査になる。
  if (!Number.isFinite(refillFullMs) || refillFullMs <= 0) {
    throw new Error(
      `createTokenBucketLimiter: capacity(${capacity}) と refillPerSec(${refillPerSec}) の組み合わせで、` +
        `空から満タンへ戻る時間（refillFullMs = capacity / refillPerSec * 1000）が ${refillFullMs} になった。` +
        `有限かつ正の値になる組み合わせにすること。`,
    );
  }
  const buckets = new Map<string, Bucket>();
  /** 前回の掃除時刻。初回は必ず走らせたいので負の無限大から始める。 */
  let lastSweepAt = Number.NEGATIVE_INFINITY;
  /** `sweep` が実際に全走査した回数（検査・テスト用）。 */
  let sweepRunCount = 0;

  /**
   * 「信用できる現在時刻」の推定値。単発の異常な `now`（前方への巨大な跳躍・後方への
   * 巻き戻り）には引きずられず、直近の呼び出しの `now` と近い値が 2 回連続したときだけ
   * 前進させる（後退はしない）。まだ一度も確定していない間は `NEGATIVE_INFINITY`。
   *
   * **単発の異常値そのものと個々のバケツの `updatedAt` を直接比べてはいけない。**
   * 前方へ大きく飛んだ `now` を 1 回だけ書き込んだバケツ（I-4）と、後方へ巻き戻った
   * `now` を 1 回だけ渡された呼び出し（V3）は、どちらも「`updatedAt` が `now` より
   * ずっと先にある」という同じ形に見える。この 2 つを見分けるには、単発の呼び出しでは
   * 動かない「複数回の呼び出しにまたがる基準点」が要る。
   */
  let stableNow = Number.NEGATIVE_INFINITY;
  /** 直近に観測した `now`。次の呼び出しでこれと近ければ `stableNow` を前進させる。 */
  let pendingNow: number | null = null;

  /** `now` を観測する。`stableNow`・`pendingNow` の更新のみ行い、バケツには触れない。 */
  function observeNow(now: number): void {
    if (pendingNow !== null && Math.abs(now - pendingNow) < refillFullMs) {
      stableNow = Math.max(stableNow, now);
    }
    pendingNow = now;
  }

  /**
   * バケツの `updatedAt` が `stableNow`（＝複数回の呼び出しで裏付けられた信用できる
   * 現在時刻）を `refillFullMs` 以上上回っているかどうか。上回っていれば、そのバケツの
   * `updatedAt` は単発の異常な `now`（時計リセット）を記録してしまったとみなし、
   * 満タン扱いで再出発してよい（I-4）。`stableNow` がまだ確定していない
   * （`NEGATIVE_INFINITY`）間は判定しない。
   */
  function isClockReset(bucket: Bucket): boolean {
    return stableNow !== Number.NEGATIVE_INFINITY && bucket.updatedAt - stableNow >= refillFullMs;
  }

  function tokensAt(bucket: Bucket, now: number): number {
    // now が過去へ巻き戻っても経過時間を負にしない（＝時間が止まったものとして扱う）。
    // 時計は後退しうるが、レート制限の会計（残量の計算）は後退させない。負の経過時間を
    // 許すと、巻き戻った直後だけ補充が「進みすぎ」たように見え、無実の利用者が
    // 締め出される（V4）。
    const elapsedMs = Math.max(0, now - bucket.updatedAt);
    const refilled = bucket.tokens + (elapsedMs / 1_000) * refillPerSec;
    return Math.min(capacity, refilled);
  }

  function sweep(now: number): void {
    // now が非有限だと満タン判定・掃除間隔の計算がすべて安全でない側へ倒れる
    // （NaN はどの比較も false にする、+Infinity は誤って「満タン」を意味してしまう）。
    // 呼び出し側の異常値でエントリを消してもレート制限が壊れるだけなので no-op にする。
    if (!Number.isFinite(now)) return;
    for (const [key, bucket] of buckets) {
      if (tokensAt(bucket, now) >= capacity) buckets.delete(key);
    }
    lastSweepAt = now;
    sweepRunCount++;
  }

  /**
   * 掃除を試みる。
   *
   * **件数だけを条件にしてはいけない。** エントリが全部フレッシュだと 1 件も消えず、
   * 件数はしきい値以上のまま残る。すると次の消費でもまた全走査が走り、O(n) が毎回になる。
   * 前回の掃除からの経過時間も条件に入れて、最悪でも `refillFullMs` に 1 回へ抑える
   * （設計正本 D4）。
   *
   * `lastSweepAt` が `now` より未来にあるとき（前方へ大きく飛んだ時刻で 1 度掃除した後、
   * now が現実的な値へ戻ったとき）は全走査せず、基準点だけを `now` へ引き戻す
   * （時計リセットの検知）。ここで絶対値（`Math.abs`）を取ると、未来に固定された
   * `lastSweepAt` との差が大きいまま残り続け、間隔条件が「経過した」ときだけでなく
   * 常に成立してしまい、その後の every consume で O(n) の全走査が走る（V7 を直す過程で
   * 実際に踏んだ）。
   */
  function maybeSweep(now: number): void {
    if (buckets.size <= sweepThreshold) return;
    if (lastSweepAt > now) {
      lastSweepAt = now;
      return;
    }
    if (now - lastSweepAt < refillFullMs) return;
    sweep(now);
  }

  return {
    shouldReject(key, now) {
      // key が文字列でないと、呼び出し側の型を無視した誤用（あるいは意図しない any）が
      // それぞれ独立したエントリを作ってしまう。now を fail-closed にしたのと同じ理由で、
      // 判定不能な入力は弾く（拒否する）側に倒す。
      if (typeof key !== "string") return true;
      // now が非有限だと `tokensAt` の比較がすべて false 側（＝通す側）へ倒れる。
      // レート制限は防御なので、例外で接続処理ごと落とすより、判定不能なら
      // 弾く（拒否する）ほうが安全側に倒れる。
      if (!Number.isFinite(now)) return true;
      // stableNow（複数回の呼び出しで裏付けられた基準点）を更新する。バケツの状態には
      // 触れないので、「shouldReject は照会だけで状態を変えない」という不変条件は保たれる。
      observeNow(now);
      const bucket = buckets.get(key);
      if (bucket === undefined) return false;
      if (isClockReset(bucket)) return false; // 満タン扱いで再出発（I-4）
      return tokensAt(bucket, now) < 1;
    },
    consume(key, now) {
      // shouldReject と同じ理由で、key が文字列でなければ状態を書き換えずに戻る。
      if (typeof key !== "string") return;
      // now が非有限だと Math.max(0, NaN) が NaN を状態へ焼き付け、以後の判定が
      // 永久に汚染される。状態を一切書き換えずに戻る（呼び出し前後で不変）。
      if (!Number.isFinite(now)) return;
      observeNow(now);
      const bucket = buckets.get(key);
      // バケツの updatedAt が stableNow を refillFullMs 以上上回っているなら、時計が
      // リセットされたとみなして満タン扱いで再出発する（I-4）。これが無いと、前方へ
      // 大きく飛んだ時刻で 1 度 consume しただけのバケツが、以後どんな正常な now が
      // 来ても「未来の updatedAt」に張り付いたまま二度と補充されず、その鍵の利用者が
      // 永久に締め出される。
      //
      // **`now` 単体ではなく `stableNow` で判定する（重要）。** 単発の now と
      // 直接比べると、後方へ巻き戻った 1 回の呼び出し（V3）も同じ形に見えてしまい、
      // バースト枠が誤って還付される。
      const resetToFull = bucket !== undefined && isClockReset(bucket);
      const startTokens = bucket === undefined || resetToFull ? capacity : tokensAt(bucket, now);
      const remaining = startTokens - 1;
      // updatedAt は「これまでの最新時刻」を下回らないようにする（時間を巻き戻さない）。
      // これを怠ると、巻き戻った now での consume が「過去の時刻」を書き込み、
      // 次の正しい now での経過時間計算が過大になって残量が丸ごと戻ってしまう（V3）。
      // ただし時計リセットを検知した場合は、その「未来の updatedAt」自体を捨てて now を
      // 新しい基準点にする（さもないと Math.max が未来の値を選び続け、I-4 の凍結が直らない）。
      const updatedAt = bucket === undefined || resetToFull ? now : Math.max(bucket.updatedAt, now);
      buckets.set(key, { tokens: Math.max(0, remaining), updatedAt });
      maybeSweep(now);
    },
    sweep,
    size: () => buckets.size,
    sweepRunCount: () => sweepRunCount,
  };
}
