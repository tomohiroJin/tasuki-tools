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
}

export interface TokenBucketOptions {
  /** 瞬間的に許す失敗の件数。 */
  capacity: number;
  /** 1 秒あたりの補充数 = 持続レート。 */
  refillPerSec: number;
  /** この件数を超えたときだけ掃除を検討する。既定 1000。 */
  sweepThreshold?: number;
}

/** 既定の容量。値の正本は設計正本 `2026-08-14-ip-rate-limit-design.md` D2。 */
export const DEFAULT_CAPACITY = 60;
/** 既定の補充速度（＝持続レート）。値の正本は同上。 */
export const DEFAULT_REFILL_PER_SEC = 1;

export function createTokenBucketLimiter(options: TokenBucketOptions): RateLimiter {
  const { capacity, refillPerSec } = options;
  const sweepThreshold = options.sweepThreshold ?? 1_000;

  // capacity・refillPerSec は起動時に決まる設定であり、実行時に利用者の入力から
  // 変わることはない。ここでの不正値は設定ミスなので、実行時の防御（拒否側へ倒す）
  // ではなく、起動時に throw して早期に気づけるようにする。
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error(`createTokenBucketLimiter: capacity は有限の正数にすること（渡された値: ${capacity}）`);
  }
  if (!Number.isFinite(refillPerSec) || refillPerSec <= 0) {
    throw new Error(
      `createTokenBucketLimiter: refillPerSec は有限の正数にすること（渡された値: ${refillPerSec}）`,
    );
  }

  /** 空から満タンへ戻るのに要する時間。掃除の最小間隔にも使う。 */
  const refillFullMs = (capacity / refillPerSec) * 1_000;
  const buckets = new Map<string, Bucket>();
  /** 前回の掃除時刻。初回は必ず走らせたいので負の無限大から始める。 */
  let lastSweepAt = Number.NEGATIVE_INFINITY;

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
  }

  /**
   * 掃除を試みる。
   *
   * **件数だけを条件にしてはいけない。** エントリが全部フレッシュだと 1 件も消えず、
   * 件数はしきい値以上のまま残る。すると次の消費でもまた全走査が走り、O(n) が毎回になる。
   * 前回の掃除からの経過時間も条件に入れて、最悪でも `refillFullMs` に 1 回へ抑える
   * （設計正本 D4）。
   *
   * 間隔の判定は `Math.abs` を取る。前方へ大きく飛んだ時刻で 1 度掃除すると
   * `lastSweepAt` が未来の値になり、その後 now が現実的な値へ戻ると差が負のまま
   * 続いて間隔条件が常に成立してしまい、掃除が永久に止まる（V7）。
   */
  function maybeSweep(now: number): void {
    if (buckets.size <= sweepThreshold) return;
    if (Math.abs(now - lastSweepAt) < refillFullMs) return;
    sweep(now);
  }

  return {
    shouldReject(key, now) {
      // now が非有限だと `tokensAt` の比較がすべて false 側（＝通す側）へ倒れる。
      // レート制限は防御なので、例外で接続処理ごと落とすより、判定不能なら
      // 弾く（拒否する）ほうが安全側に倒れる。
      if (!Number.isFinite(now)) return true;
      const bucket = buckets.get(key);
      return bucket !== undefined && tokensAt(bucket, now) < 1;
    },
    consume(key, now) {
      // now が非有限だと Math.max(0, NaN) が NaN を状態へ焼き付け、以後の判定が
      // 永久に汚染される。状態を一切書き換えずに戻る（呼び出し前後で不変）。
      if (!Number.isFinite(now)) return;
      const bucket = buckets.get(key);
      const remaining = (bucket === undefined ? capacity : tokensAt(bucket, now)) - 1;
      // updatedAt は「これまでの最新時刻」を下回らないようにする（時間を巻き戻さない）。
      // これを怠ると、巻き戻った now での consume が「過去の時刻」を書き込み、
      // 次の正しい now での経過時間計算が過大になって残量が丸ごと戻ってしまう（V3）。
      const updatedAt = bucket === undefined ? now : Math.max(bucket.updatedAt, now);
      buckets.set(key, { tokens: Math.max(0, remaining), updatedAt });
      maybeSweep(now);
    },
    sweep,
    size: () => buckets.size,
  };
}
