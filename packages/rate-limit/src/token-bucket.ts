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
  /** 空から満タンへ戻るのに要する時間。掃除の最小間隔にも使う。 */
  const refillFullMs = (capacity / refillPerSec) * 1_000;
  const buckets = new Map<string, Bucket>();
  /** 前回の掃除時刻。初回は必ず走らせたいので負の無限大から始める。 */
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function tokensAt(bucket: Bucket, now: number): number {
    const refilled = bucket.tokens + ((now - bucket.updatedAt) / 1_000) * refillPerSec;
    return Math.min(capacity, refilled);
  }

  function sweep(now: number): void {
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
   */
  function maybeSweep(now: number): void {
    if (buckets.size <= sweepThreshold) return;
    if (now - lastSweepAt < refillFullMs) return;
    sweep(now);
  }

  return {
    shouldReject(key, now) {
      const bucket = buckets.get(key);
      return bucket !== undefined && tokensAt(bucket, now) < 1;
    },
    consume(key, now) {
      const bucket = buckets.get(key);
      const remaining = (bucket === undefined ? capacity : tokensAt(bucket, now)) - 1;
      buckets.set(key, { tokens: Math.max(0, remaining), updatedAt: now });
      maybeSweep(now);
    },
    sweep,
    size: () => buckets.size,
  };
}
