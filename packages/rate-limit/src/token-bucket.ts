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
 * `shouldReject` は**純粋な照会**であり、状態を一切書き換えない（設計正本 D4）。
 * D3 の順序では同じ `now` が `shouldReject` と `consume` の 2 回観測されるため、
 * 「照会でも状態を進める」設計にすると、単発の異常な `now` が自分自身を裏付けとして
 * 認証してしまう（実際にそれで凍結する実装を一度作った）。
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
 *
 * **呼び出し側は単調時計（`performance.now()`）を渡すこと（MUST。設計正本 D8）。**
 * 壁時計（`Date.now()`）は NTP のステップ調整・起動時の時計補正で非単調になりうる。
 * レート制限が必要とするのは経過時間だけで絶対時刻は使わないため、単調時計への
 * 差し替えで「壊れた値が来る」経路自体を消せる。ルームの会計（アイドル回収など）に
 * 使う壁時計とは**別系統**であり、同じ `now` を使い回さないこと。
 *
 * ## 会計は `now` そのものではなく内部基準時刻で行う
 *
 * 渡された `now` をそのまま会計に使わず、**単調非減少で、1 回の呼び出しで進める幅に
 * 上限のある内部基準時刻**へ丸めてから使う（`refTime`）。詳細はその docstring と
 * 設計正本 D4 を参照。単調なので `updatedAt` が基準時刻より未来になることが原理的に
 * 起きず、「時計リセットの検知」も「満タン扱いで再出発」も要らない。
 * **許可側（レート制限が緩む側）への譲歩は `refillFullMs` の上限 1 か所に集約され、
 * その総量は観測した `now` の最大値で頭打ちになる**のがこの方式の要点である
 * （旧方式は誤検知のたび無制限に還付した）。単調時計を渡しても、コールドスタート時の
 * 残余（D4・D8）は消えない。呼び出し側の契約違反（壁時計を渡す等）に備え、
 * `refTime` の 3 つの上限は多層防御として残す。
 */

/** 鍵ごとの残量。`updatedAt` からの経過時間で補充量を後から計算する（遅延評価）。 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiter {
  /** 残量が 1 未満なら true。**資源を照会する前に呼ぶこと。** 状態は書き換えない（純粋な照会）。 */
  shouldReject(key: string, now: number): boolean;
  /** 失敗が確定したときだけ呼ぶ。トークンを 1 つ消費する。 */
  consume(key: string, now: number): void;
  /** 満タンに戻ったエントリを捨てる。 */
  sweep(now: number): void;
  /** 保持しているエントリ数（検査・運用観測用）。 */
  size(): number;
  /** `sweep` が実際に全走査した回数（検査・運用観測用）。 */
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
/** 掃除しきい値の上限。値の正本と根拠は設計正本 `2026-08-14-ip-rate-limit-design.md` D4。 */
export const MAX_SWEEP_THRESHOLD = 1_000_000;

export function createTokenBucketLimiter(options: TokenBucketOptions): RateLimiter {
  const { capacity, refillPerSec } = options;
  // `??` だと null も既定へ落ちてしまい、"0"・true・[] のような他の不正値（下の
  // Number.isFinite 検査で throw する）と扱いが非対称になる（M-2）。既定へ落ちるのは
  // 「省略した」＝ undefined のときだけにする。
  const sweepThreshold =
    options.sweepThreshold === undefined ? DEFAULT_SWEEP_THRESHOLD : options.sweepThreshold;

  // capacity・refillPerSec・sweepThreshold は起動時に決まる設定であり、実行時に利用者の
  // 入力から変わることはない。ここでの不正値は設定ミスなので、実行時の防御（拒否側へ倒す）
  // ではなく、起動時に throw して早期に気づけるようにする。
  //
  // capacity は「1 以上」を要求する（0 < capacity < 1 を弾く）。容量が 1 未満だと、
  // 満タンでも残量が 1 に届かないため、一度でも失敗した鍵は補充が終わっても
  // `tokensAt(...) < 1` が成立し続け、その鍵の利用者が永久に拒否される（実測: capacity 0.5）。
  if (!Number.isFinite(capacity) || capacity < 1) {
    throw new Error(`createTokenBucketLimiter: capacity は 1 以上の有限数にすること（渡された値: ${capacity}）`);
  }
  if (!Number.isFinite(refillPerSec) || refillPerSec <= 0) {
    throw new Error(
      `createTokenBucketLimiter: refillPerSec は有限の正数にすること（渡された値: ${refillPerSec}）`,
    );
  }
  // sweepThreshold は 0 も有効（毎回サイズ条件を満たす、という意味のある設定）なので、
  // capacity・refillPerSec と異なり下限は `<= 0` ではなく `< 0` にする。
  //
  // 上限も要る。有限でも巨大な値（例: Number.MAX_VALUE）を渡すと `buckets.size` が
  // 一生しきい値を超えず、自動の掃除が完全に死ぬ（実測: 5 万件保持・掃除 0 回）。
  // 非有限を throw で弾いておきながら「有限だが到達不能な値」を素通しするのは、
  // 同じ結末（掃除の停止）を別の入口から許すことになるので、上限も設定ミスとして弾く。
  if (!Number.isFinite(sweepThreshold) || sweepThreshold < 0 || sweepThreshold > MAX_SWEEP_THRESHOLD) {
    throw new Error(
      `createTokenBucketLimiter: sweepThreshold は有限かつ 0 以上 ${MAX_SWEEP_THRESHOLD} 以下にすること` +
        `（渡された値: ${sweepThreshold}）`,
    );
  }

  /** 空から満タンへ戻るのに要する時間。掃除の最小間隔と基準時刻の前進幅の上限にも使う。 */
  const refillFullMs = (capacity / refillPerSec) * 1_000;
  // capacity・refillPerSec は個別には正常でも、商（refillFullMs）はオーバーフローで
  // Infinity になりうる（I-2）。Infinity だと掃除の間隔条件が永久に成立せず掃除が死に、
  // 基準時刻の前進幅にも上限が無くなる。
  // （`<= 0` 側は capacity >= 1 を要求した時点で到達しないが、将来 capacity の下限を
  //   緩めたときに静かに壊れないよう、導出値そのものの検査として残す。）
  if (!Number.isFinite(refillFullMs) || refillFullMs <= 0) {
    throw new Error(
      `createTokenBucketLimiter: capacity(${capacity}) と refillPerSec(${refillPerSec}) の組み合わせで、` +
        `空から満タンへ戻る時間（refillFullMs = capacity / refillPerSec * 1000）が ${refillFullMs} になった。` +
        `有限かつ正の値になる組み合わせにすること。`,
    );
  }
  // M-1: refillFullMs は「基準時刻を進めてよい前進幅の上限」（refTime）にも使われる。
  // capacity が小さく refillPerSec が大きいと、refillFullMs 自体は有限の正数でも
  // 基準時刻の規模に対して意味を持たないほど小さくなりうる（実測: capacity:1,
  // refillPerSec:1e7 で refillFullMs≈1e-4。`clock + refillFullMs === clock` となり、
  // 基準時刻が一切前進しなかった＝理想は膨大な通過件数のはずが通過は 1 件だけだった）。
  //
  // 判定は `Number.MAX_SAFE_INTEGER` 規模を基準にする。呼び出し側は単調時計
  // （設計正本 D8）を渡す契約だが、内部ガードは多層防御として「now がどんな規模でも
  // 壊れない」ことを目指す。安全な整数の上限という、実際にありうるどんな `now`
  // （`performance.now()` はもちろん `Date.now()` の epoch ms も含む）よりはるかに
  // 大きい規模で「前進幅として意味を持つか」を検査すれば、より小さい規模の `now`
  // では確実に意味を持つ（その規模での丸め誤差の桁はより大きい規模以下になる）。
  if (Number.MAX_SAFE_INTEGER + refillFullMs === Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `createTokenBucketLimiter: capacity(${capacity}) と refillPerSec(${refillPerSec}) の組み合わせで、` +
        `refillFullMs が ${refillFullMs} になった。これは基準時刻の前進幅として小さすぎ、` +
        `丸め誤差で吸収されて基準時刻が前進しなくなる（Number.MAX_SAFE_INTEGER 規模で検査）。` +
        `capacity を上げるか refillPerSec を下げること。`,
    );
  }
  const buckets = new Map<string, Bucket>();
  /** 前回の掃除時刻（基準時刻の目盛り）。初回は必ず走らせたいので負の無限大から始める。 */
  let lastSweepAt = Number.NEGATIVE_INFINITY;
  /** `sweep` が実際に全走査した回数（検査・運用観測用）。 */
  let sweepRunCount = 0;

  /**
   * 会計に使う基準時刻。まだ 1 度も確定していない間は `NEGATIVE_INFINITY`。
   * **単調非減少**であり、渡された `now` を上回ることはない。
   */
  let clock = Number.NEGATIVE_INFINITY;
  /** 直近に観測した `now`。基準時刻を進めてよい実経過の上限を測るために持つ。 */
  let lastNow = Number.NEGATIVE_INFINITY;

  /**
   * `now` を会計用の基準時刻へ丸める。`now` をそのまま使わず、基準時刻を進める幅を
   * 次の 3 つの上限の最小で決める（負なら 0 に丸める＝進めない）。
   *
   * - `now - lastNow`: 直近の観測からの実経過。時計が巻き戻れば負になり 0 に丸まるので、
   *   巻き戻り中は「時間が止まる」挙動になる（V4: 無実の利用者を締め出さない）
   * - `now - clock`: 基準時刻を実時刻より先へは出さない。巻き戻った後の復路
   *   （元の時刻へ戻るまでの差分）を二重に加算しない（V3: バースト枠を還付しない）
   * - `refillFullMs`: 1 度の前方飛びで進めるのは満タン 1 杯ぶんまで。壊れた時計が
   *   1 回だけ遠い未来を渡しても、基準時刻はそこへ飛ばない（I-4: 永久凍結しない）
   *
   * 結果として基準時刻は単調非減少になり、`updatedAt`（＝過去のある時点の基準時刻）が
   * 基準時刻より未来になることが原理的に起きない。だから「時計リセットの検知」も
   * 「満タン扱いで再出発」も要らない。**許可側（レート制限が緩む側）への譲歩は
   * `refillFullMs` の上限 1 か所に集約され、その総量は観測した `now` の最大値で
   * 頭打ちになる**（旧方式は誤検知のたび無制限に還付した。差はここにある）。
   *
   * `commit` が偽のときは基準点を一切動かさない。`shouldReject` を純粋な照会に保つため
   * であり、これが要る理由は D3 の呼び出し順にある。`shouldReject(k, t)` → `consume(k, t)`
   * は同じ `now` を 2 回観測するので、照会でも基準点を動かすと単発の異常値が自分自身を
   * 裏付けとして認証できてしまう。
   *
   * **残余**: ごく最初の 1 回目の呼び出し（`consume` または `sweep`）が壊れた時計だった
   * 場合（比較する基準がまだ存在しないコールドスタート）は、その値が基準時刻になる。
   * `clock` は限定器インスタンスに 1 個しか無いため、**特定の鍵だけでなく全鍵が凍結する**。
   * 凍結中は誰も満タンに戻らないので `sweep` が回収できず、Map のエントリが増え続ける。
   * 呼び出し側が単調時計（設計正本 D8）を渡せば、この基準点に「壊れた値」が来る経路
   * そのものが無くなる（残余自体は消えないが、原因が消える）。
   */
  function refTime(now: number, commit: boolean): number {
    if (clock === Number.NEGATIVE_INFINITY) {
      if (commit) {
        clock = now;
        lastNow = now;
      }
      return now;
    }
    const step = Math.max(0, Math.min(now - lastNow, now - clock, refillFullMs));
    const t = clock + step;
    if (commit) {
      clock = t;
      lastNow = now;
    }
    return t;
  }

  /**
   * 基準時刻 `t` における残量。`t` は単調非減少で、どのバケツの `updatedAt` も過去の
   * 基準時刻なので、経過時間が負になることは原理的に無い（負のクランプは不要）。
   */
  function tokensAt(bucket: Bucket, t: number): number {
    const refilled = bucket.tokens + ((t - bucket.updatedAt) / 1_000) * refillPerSec;
    return Math.min(capacity, refilled);
  }

  /** 実際に全走査して、満タンに戻ったエントリを捨てる。`t` は基準時刻。 */
  function sweepAt(t: number): void {
    for (const [key, bucket] of buckets) {
      if (tokensAt(bucket, t) >= capacity) buckets.delete(key);
    }
    lastSweepAt = t;
    sweepRunCount++;
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
      const t = refTime(now, false); // 状態を変えない＝純粋な照会のまま
      const bucket = buckets.get(key);
      return bucket !== undefined && tokensAt(bucket, t) < 1;
    },
    consume(key, now) {
      // shouldReject と同じ理由で、key が文字列でなければ状態を書き換えずに戻る。
      if (typeof key !== "string") return;
      // now が非有限だと NaN が基準時刻・残量へ焼き付き、以後の判定が永久に汚染される。
      // 状態を一切書き換えずに戻る（呼び出し前後で不変）。
      if (!Number.isFinite(now)) return;
      const t = refTime(now, true);
      const bucket = buckets.get(key);
      const remaining = (bucket === undefined ? capacity : tokensAt(bucket, t)) - 1;
      buckets.set(key, { tokens: Math.max(0, remaining), updatedAt: t });
      // 掃除は件数だけを条件にしてはいけない。エントリが全部フレッシュだと 1 件も消えず、
      // 件数はしきい値以上のまま残る。すると次の消費でもまた全走査が走り、O(n) が毎回になる。
      // 前回の掃除からの経過も条件に入れる。基準時刻は 1 回の呼び出しで最大 refillFullMs
      // しか進まないので、全走査は最悪でも refillFullMs に 1 回に抑えられる（設計正本 D4）。
      if (buckets.size > sweepThreshold && t - lastSweepAt >= refillFullMs) sweepAt(t);
    },
    sweep(now) {
      // now が非有限だと満タン判定・掃除間隔の計算がすべて安全でない側へ倒れる
      // （NaN はどの比較も false にする、+Infinity は誤って「満タン」を意味してしまう）。
      // 呼び出し側の異常値でエントリを消してもレート制限が壊れるだけなので no-op にする。
      if (!Number.isFinite(now)) return;
      // sweep は状態を書き換える公開操作（エントリの削除・lastSweepAt の更新）なので、
      // 照会側の shouldReject とは違い commit する。定期バッチ・管理コマンドから
      // sweep だけを繰り返し呼ぶ運用でも基準時刻が実時刻に追随できるようにするため。
      sweepAt(refTime(now, true));
    },
    size: () => buckets.size,
    sweepRunCount: () => sweepRunCount,
  };
}
