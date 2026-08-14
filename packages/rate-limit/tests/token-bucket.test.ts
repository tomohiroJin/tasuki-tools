/**
 * トークンバケツのテスト。
 *
 * `now` を引数で受けるので、実時間に一切依存しない（タイマーも sleep も使わない）。
 */
import { describe, it, expect } from "vitest";
import {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
  DEFAULT_SWEEP_THRESHOLD,
  MAX_SWEEP_THRESHOLD,
} from "../src/index.js";

const T0 = 1_000_000;

describe("createTokenBucketLimiter", () => {
  describe("バースト", () => {
    it("容量ぶんまでは連続して消費できる", () => {
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      for (let i = 0; i < 3; i++) {
        expect(limiter.shouldReject("k", T0), `${i} 回目`).toBe(false);
        limiter.consume("k", T0);
      }
      expect(limiter.shouldReject("k", T0)).toBe(true);
    });

    it("鍵ごとに独立している", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      limiter.consume("a", T0);
      expect(limiter.shouldReject("a", T0)).toBe(true);
      expect(limiter.shouldReject("b", T0)).toBe(false);
    });

    it("一度も使っていない鍵は拒否しない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      expect(limiter.shouldReject("未使用", T0)).toBe(false);
    });
  });

  describe("補充", () => {
    it("1 秒で 1 個補充される", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      expect(limiter.shouldReject("k", T0)).toBe(true);
      expect(limiter.shouldReject("k", T0 + 999)).toBe(true);
      expect(limiter.shouldReject("k", T0 + 1_000)).toBe(false);
    });

    it("容量を超えて溜まらない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      // 1 時間放置しても、消費できるのは容量ぶんだけ
      const later = T0 + 3_600_000;
      limiter.consume("k", later);
      limiter.consume("k", later);
      expect(limiter.shouldReject("k", later)).toBe(true);
    });

    it("持続レートは refillPerSec に収束する", () => {
      const limiter = createTokenBucketLimiter({ capacity: 5, refillPerSec: 1 });
      // まずバーストを使い切る
      for (let i = 0; i < 5; i++) limiter.consume("k", T0);
      // 以後は 1 秒に 1 件しか通らない
      let passed = 0;
      for (let s = 1; s <= 10; s++) {
        const now = T0 + s * 1_000;
        if (!limiter.shouldReject("k", now)) {
          limiter.consume("k", now);
          passed++;
        }
      }
      expect(passed).toBe(10);
    });
  });

  describe("掃除", () => {
    it("満タンに戻ったエントリを捨てる", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      expect(limiter.size()).toBe(1);
      limiter.sweep(T0 + 2_000);
      expect(limiter.size()).toBe(0);
    });

    it("まだ回復途中のエントリは残す", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      limiter.sweep(T0 + 1_000);
      expect(limiter.size()).toBe(1);
    });

    it("しきい値を超えても、前回の掃除から間隔が空くまでは走らない", () => {
      // capacity 2 / refill 1 なので、掃除の最小間隔は 2 秒
      const limiter = createTokenBucketLimiter({
        capacity: 2,
        refillPerSec: 1,
        sweepThreshold: 2,
      });
      limiter.consume("a", T0);
      limiter.consume("b", T0);
      limiter.consume("c", T0); // ここで初回の掃除が走る（前回が無いので間隔条件は満たす）
      // 全部フレッシュなので何も消えない
      expect(limiter.size()).toBe(3);
      // 直後にもう 1 件消費しても、間隔が空いていないので掃除は走らない
      limiter.consume("d", T0 + 1);
      expect(limiter.size()).toBe(4);
      // 間隔が空けば走り、回復済みのものが消える
      limiter.consume("e", T0 + 10_000);
      expect(limiter.size()).toBe(1);
    });

    it("掃除で消えた鍵は、次の呼び出しで未使用の鍵として扱われる", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.sweep(T0 + 2_000); // 満タンに戻ったので消える
      expect(limiter.size()).toBe(0);
      expect(limiter.shouldReject("k", T0 + 2_000)).toBe(false);
      limiter.consume("k", T0 + 2_000);
      limiter.consume("k", T0 + 2_000);
      expect(limiter.shouldReject("k", T0 + 2_000)).toBe(true);
    });
  });

  describe("時刻の頑健性（単調でない now）", () => {
    it("now が巻き戻っても例外を投げず、容量を超えて溜まらない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0 + 10_000);
      limiter.consume("k", T0 + 10_000); // 満タンから使い切る
      expect(() => limiter.shouldReject("k", T0)).not.toThrow(); // 巻き戻った now
      expect(() => limiter.consume("k", T0)).not.toThrow();
      // now がどれだけ乱れても、消費できるのは容量ぶんだけ
      limiter.consume("k", T0 + 20_000);
      limiter.consume("k", T0 + 20_000);
      expect(limiter.shouldReject("k", T0 + 20_000)).toBe(true);
    });

    it("shouldReject は照会だけで状態を変えない（巻き戻った now でも）", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      limiter.consume("k", T0 + 5_000);
      limiter.shouldReject("k", T0); // 巻き戻った now で照会するだけ
      // 状態は変わっていないので、正しい時刻での判定は照会前と同じ
      expect(limiter.shouldReject("k", T0 + 5_000)).toBe(true);
      expect(limiter.shouldReject("k", T0 + 6_000)).toBe(false); // 1 秒後には回復
    });

    it("shouldReject は共有状態にも副作用を持たない（別の鍵への照会を挟んでも通過件数が同じ）", () => {
      // バケツの残量しか見ないテストでは、鍵をまたいで共有される内部状態（基準時刻）を
      // 照会が書き換えていても検出できない。実際、前ラウンドの実装は shouldReject が
      // 共有の基準点を進めており、そのせいで D3 の呼び出し順が壊れていた。
      // ここでは「対象の鍵の通過件数」が、別の鍵への照会を挟んでも変わらないことを見る。
      const passesWith = (interleaveOtherKey: boolean): number => {
        const limiter = createTokenBucketLimiter({ capacity: 60, refillPerSec: 1 });
        for (let i = 0; i < 60; i++) limiter.consume("k", T0); // 使い切る
        let passed = 0;
        // 100ms 刻みで進めるので、補充は 10 回に 1 回しか 1 トークンに届かない。
        for (let s = 1; s <= 2_000; s++) {
          const now = T0 + s * 100;
          // 別の鍵に対する照会。純粋な照会なら、対象の鍵の結果に一切影響しない。
          if (interleaveOtherKey) limiter.shouldReject("別の鍵", now + 3_600_000);
          if (!limiter.shouldReject("k", now)) {
            limiter.consume("k", now);
            passed++;
          }
        }
        return passed;
      };
      expect(passesWith(true)).toBe(passesWith(false));
    });

    it("V4: 失敗 1 回だけの利用者が、時計の巻き戻りで締め出されない", () => {
      // capacity 60 / refill 1。1 回だけ失敗した無実の利用者（残 59）を想定する。
      const limiter = createTokenBucketLimiter({ capacity: 60, refillPerSec: 1 });
      limiter.consume("k", T0 + 60_000);
      expect(limiter.shouldReject("k", T0 + 60_000)).toBe(false); // 直後はまだ通る（残 59）

      // 時計が巻き戻る（NTP のステップ調整・VM スナップショット復帰などで起きる）
      expect(limiter.shouldReject("k", T0 + 60_000 - 1_000)).toBe(false);
      expect(limiter.shouldReject("k", T0 + 60_000 - 300_000)).toBe(false);
    });

    it("V3: 巻き戻った now での consume はバースト枠を戻さない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 60, refillPerSec: 1 });
      for (let i = 0; i < 60; i++) limiter.consume("k", T0); // 使い切る
      limiter.consume("k", T0 - 600_000); // 巻き戻った now で consume が 1 回入る

      // 巻き戻りを悪用してバースト枠が回復していないこと
      let passed = 0;
      for (let i = 0; i < 60; i++) {
        if (!limiter.shouldReject("k", T0)) {
          limiter.consume("k", T0);
          passed++;
        }
      }
      expect(passed).toBe(0);
    });
  });

  describe("非有限な now（V1）", () => {
    it("shouldReject は非有限な now を拒否側へ倒す（未使用の鍵でも true）", () => {
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      expect(limiter.shouldReject("未使用", NaN)).toBe(true);
      expect(limiter.shouldReject("未使用", Number.POSITIVE_INFINITY)).toBe(true);
      expect(limiter.shouldReject("未使用", Number.NEGATIVE_INFINITY)).toBe(true);
    });

    it("consume は非有限な now では状態を書き換えない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      limiter.consume("k", NaN);
      expect(limiter.size()).toBe(0); // NaN では何も作られない

      limiter.consume("k", T0); // 通常の消費
      const sizeAfterNormal = limiter.size();
      limiter.consume("k", NaN);
      limiter.consume("k", Number.POSITIVE_INFINITY);
      limiter.consume("k", Number.NEGATIVE_INFINITY);
      expect(limiter.size()).toBe(sizeAfterNormal); // 非有限な consume では増減しない

      // NaN を挟んでも、後続の通常の now での判定が汚染されない
      expect(limiter.shouldReject("k", T0)).toBe(false); // 残 2（容量3から1消費）
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      expect(limiter.shouldReject("k", T0)).toBe(true); // 使い切った
      expect(limiter.shouldReject("k", T0 + 1_000)).toBe(false); // 通常どおり回復する
    });

    it("sweep は非有限な now では no-op", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.sweep(NaN);
      expect(limiter.size()).toBe(1); // NaN では消えない
      limiter.sweep(Number.POSITIVE_INFINITY);
      expect(limiter.size()).toBe(1); // Infinity でも消えない（誤って「満タン」扱いしない）
      limiter.sweep(T0 + 2_000); // 通常の now では消える
      expect(limiter.size()).toBe(0);
    });
  });

  describe("掃除の間隔（V7: 前方へ飛んだ後に時計が戻る）", () => {
    it("前方へ大きく飛んだ掃除の後、現実的な now へ戻っても掃除が止まらない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1, sweepThreshold: 1 });
      limiter.consume("seed", T0);
      limiter.consume("seed2", T0); // size=2 > threshold(1) → 初回の掃除が走る（フレッシュなので何も消えない）
      expect(limiter.size()).toBe(2);

      // 前方へ大きく飛んだ時刻で直接 sweep を呼ぶ（例: 手動運用）。lastSweepAt が未来へ飛ぶ
      limiter.sweep(T0 + 1_000_000);
      expect(limiter.size()).toBe(0); // seed/seed2 は満タンに回復済みなので消える

      // 時計が現実的な値へ戻る（NTP 補正など）
      limiter.consume("x", T0 + 2_000);
      limiter.consume("y", T0 + 2_000); // size=2 > threshold(1) だが x,y はフレッシュなので消えない
      expect(limiter.size()).toBe(2);

      // refillFullMs（2 秒）経過後、x・y は満タンに回復している。しきい値超で次の consume が掃除を試みる
      limiter.consume("z", T0 + 5_000);
      expect(limiter.size()).toBe(1); // x・y は掃除で消え、z だけ残る
    });
  });

  describe("設定の検査（V9）", () => {
    it("refillPerSec が 0 なら throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: 0 })).toThrow();
    });

    it("refillPerSec が負なら throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: -1 })).toThrow();
    });

    it("refillPerSec が非有限なら throw する", () => {
      expect(() =>
        createTokenBucketLimiter({ capacity: 60, refillPerSec: Number.POSITIVE_INFINITY }),
      ).toThrow();
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: NaN })).toThrow();
    });

    it("capacity が 0 なら throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 0, refillPerSec: 1 })).toThrow();
    });

    it("capacity が負または非有限なら throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: -1, refillPerSec: 1 })).toThrow();
      expect(() =>
        createTokenBucketLimiter({ capacity: Number.POSITIVE_INFINITY, refillPerSec: 1 }),
      ).toThrow();
      expect(() => createTokenBucketLimiter({ capacity: NaN, refillPerSec: 1 })).toThrow();
    });

    it("capacity が 1 未満（0 < capacity < 1）なら throw する", () => {
      // 容量が 1 未満だと満タンでも残量が 1 に届かず、一度失敗した鍵は補充が終わっても
      // 永久に拒否され続ける（実測: capacity 0.5 で 1 回失敗した鍵はその後 1 件も通らない）。
      expect(() => createTokenBucketLimiter({ capacity: 0.5, refillPerSec: 1 })).toThrow();
      expect(() => createTokenBucketLimiter({ capacity: 0.999_999, refillPerSec: 1 })).toThrow();
      expect(() => createTokenBucketLimiter({ capacity: 5e-324, refillPerSec: 1 })).toThrow();
    });

    it("capacity が 1 ちょうどなら通る（下限は 1 を含む）", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      expect(limiter.shouldReject("k", T0)).toBe(false);
      limiter.consume("k", T0);
      expect(limiter.shouldReject("k", T0)).toBe(true);
      expect(limiter.shouldReject("k", T0 + 1_000)).toBe(false); // 補充されれば再び通る
    });
  });

  describe("既定閾値の固定（R1・設計正本 D2）", () => {
    it("DEFAULT_CAPACITY は 60 で固定（D2 の MUST）", () => {
      expect(DEFAULT_CAPACITY).toBe(60);
    });

    it("DEFAULT_REFILL_PER_SEC は 1 で固定（D2 の MUST）", () => {
      expect(DEFAULT_REFILL_PER_SEC).toBe(1);
    });

    it("DEFAULT_SWEEP_THRESHOLD は 1000 で固定（D4 の既定値）", () => {
      expect(DEFAULT_SWEEP_THRESHOLD).toBe(1_000);
    });

    it("MAX_SWEEP_THRESHOLD は 1,000,000 で固定（D4 の上限値）", () => {
      expect(MAX_SWEEP_THRESHOLD).toBe(1_000_000);
    });
  });

  describe("設定の検査（I-1: sweepThreshold）", () => {
    it("sweepThreshold が非有限（Infinity）なら throw する", () => {
      expect(() =>
        createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: Number.POSITIVE_INFINITY }),
      ).toThrow();
    });

    it("sweepThreshold が非有限（NaN）なら throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: NaN })).toThrow();
    });

    it("sweepThreshold が負なら throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: -1 })).toThrow();
    });

    it("sweepThreshold が数値でない（\"0\"）なら throw する", () => {
      expect(() =>
        createTokenBucketLimiter({
          capacity: 60,
          refillPerSec: 1,
          sweepThreshold: "0" as unknown as number,
        }),
      ).toThrow();
    });

    it("sweepThreshold が 0 なら通る（有限かつ 0 以上なので有効な設定）", () => {
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: 0 })).not.toThrow();
    });

    it("sweepThreshold が上限超（有限でも巨大）なら throw する", () => {
      // 有限であっても到達不能に大きい値は、自動の掃除を完全に殺す（実測:
      // Number.MAX_VALUE で 5 万件を保持したまま掃除が 0 回）。非有限を throw で弾いて
      // おきながら同じ結末を別の入口から許さない。
      expect(() =>
        createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: Number.MAX_VALUE }),
      ).toThrow();
      expect(() =>
        createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: MAX_SWEEP_THRESHOLD + 1 }),
      ).toThrow();
    });

    it("sweepThreshold が上限ちょうどなら通る", () => {
      expect(() =>
        createTokenBucketLimiter({ capacity: 60, refillPerSec: 1, sweepThreshold: MAX_SWEEP_THRESHOLD }),
      ).not.toThrow();
    });
  });

  describe("設定の検査（I-2: 導出値 refillFullMs）", () => {
    it("capacity=60・refillPerSec=1e-320 は refillFullMs が Infinity になるので throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 60, refillPerSec: 1e-320 })).toThrow();
    });

    it("capacity=1e306・refillPerSec=1 は refillFullMs が Infinity になるので throw する", () => {
      expect(() => createTokenBucketLimiter({ capacity: 1e306, refillPerSec: 1 })).toThrow();
    });

    it("capacity=5e-324・refillPerSec=1e308 のような潰れた組み合わせも throw する", () => {
      // この組み合わせは refillFullMs が 0 になるアンダーフロー例だが、capacity >= 1 の
      // 要求が入った今は capacity 側で先に弾かれる。導出値側の `<= 0` 判定は、将来
      // capacity の下限を緩めたときに静かに壊れないための保険として残してある。
      expect(() => createTokenBucketLimiter({ capacity: 5e-324, refillPerSec: 1e308 })).toThrow();
    });

    it("throw のメッセージに capacity と refillPerSec の両方の値が含まれる", () => {
      expect(() => createTokenBucketLimiter({ capacity: 1e306, refillPerSec: 1 })).toThrow(/1e\+306/);
    });
  });

  describe("掃除の間隔の再発検知（I-3: 時計の往復で全走査が毎回走らない）", () => {
    it("前方への時計飛びの後、通常の now が続いても全走査は毎回は走らない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1, sweepThreshold: 1 });
      limiter.consume("seed", T0);
      limiter.consume("seed2", T0); // size=2 > threshold(1) → 初回の掃除が走る
      expect(limiter.sweepRunCount()).toBe(1);

      // 前方へ大きく飛んだ時刻で直接 sweep（例: 手動運用）。lastSweepAt が未来へ飛ぶ
      limiter.sweep(T0 + 1_000_000);
      expect(limiter.sweepRunCount()).toBe(2);

      // 時計が現実的な値へ戻り、その後わずかずつ前進する（refillFullMs=2000ms未満の間隔）。
      // 締めていなければ、未来に固定された lastSweepAt との差が大きいまま残り続け、
      // 間隔条件が常に成立して 1,000 回とも全走査が走ってしまう。
      for (let i = 0; i < 1_000; i++) {
        limiter.consume(`k${i}`, T0 + 2_000 + i);
      }
      expect(limiter.sweepRunCount()).toBeLessThan(10);
    });

    it("now が refillFullMs 超の振幅で往復し続けても、全走査は基準時刻の前進ぶんに収まる", () => {
      // capacity 2 / refill 1 なので refillFullMs は 2,000ms。前方(未来)と後方(現実的な値)を
      // 振幅 998,000ms（refillFullMs を大きく超える）で 5,000 回往復させる。
      //
      // 判定の根拠は D4 の MUST そのもの:「全走査は最悪でも refillFullMs に 1 回」。
      // 基準時刻は 1 回の呼び出しで最大 refillFullMs しか進まず、かつ実時刻 now を
      // 追い越さない。往復の上端は T0 + 1,000,000、下端は T0 + 2,000 なので、
      // この 5,000 回で基準時刻が進みうる幅は 998,000ms = refillFullMs の 499 個ぶん。
      // よって全走査は 499 回を超えられない。
      //
      // 上限（now - clock）を外すと基準時刻が実時刻を追い越して前進し続け、往復のたびに
      // 間隔条件が成立して 2,500 回走る。この判定はそれを落とす。
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1, sweepThreshold: 1 });
      limiter.consume("seed", T0);
      limiter.consume("seed2", T0);
      limiter.sweep(T0 + 1_000_000); // lastSweepAt を未来（に見える now）で更新する

      const runsBeforeOscillation = limiter.sweepRunCount();
      const iterations = 5_000;
      const swingMs = 998_000;
      const refillFullMs = 2_000;
      for (let i = 0; i < iterations; i++) {
        const now = i % 2 === 0 ? T0 + 2_000 : T0 + 1_000_000;
        limiter.consume(`k${i}`, now);
      }
      const runsDuringOscillation = limiter.sweepRunCount() - runsBeforeOscillation;
      expect(runsDuringOscillation).toBeLessThanOrEqual(swingMs / refillFullMs);
    });
  });

  describe("単調性ガードの再発検知（I-4: 前方への時計飛びで永久凍結しない）", () => {
    it("D3 の呼び出し順（shouldReject → consume）でも、100 年先の now 1 回で凍結しない", () => {
      // **この順序で書くことが要点。** D3 は shouldReject(k, t) → consume(k, t) を要求するので、
      // 実運用では同じ now が 2 回観測される。consume を単発で呼ぶテストは実経路を通っておらず、
      // 「照会でも基準点を進める」実装の穴（単発の異常値が自分自身を裏付けとして認証する）を
      // 見逃した（実測: 単発呼びで 100,000 件・D3 の順で 59 件）。
      const limiter = createTokenBucketLimiter({ capacity: 60, refillPerSec: 1 });
      // 稼働中の制限器を模す。コールドスタート（比較する基準が無い）とは別の残余なので、
      // 先に正常な now を 1 往復通して基準時刻を確立しておく。
      limiter.shouldReject("k", T0);
      limiter.consume("k", T0);

      // 時計が壊れて大きく前方へ飛んだ 1 回。D3 の順で呼ぶ。
      const farFuture = T0 + 100 * 365 * 24 * 60 * 60 * 1_000;
      limiter.shouldReject("k", farFuture);
      limiter.consume("k", farFuture);

      let passed = 0;
      for (let s = 1; s <= 100_000; s++) {
        const now = T0 + s * 1_000;
        if (!limiter.shouldReject("k", now)) {
          limiter.consume("k", now);
          passed++;
        }
      }
      // 凍結していれば残量ぶん（59 件前後）で頭打ちになる。凍結していなければ毎秒 1 個
      // 補充されるので、ほぼ全件（10 万件）通る。
      expect(passed).toBeGreaterThan(99_000);
    });

    it("前方へ飛んだ now で書かれたエントリも、通常の now が続けば掃除で回収される", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0); // 稼働中の基準時刻を作る
      limiter.consume("k", T0 + 1_000_000_000); // 前方へ大きく飛んだ 1 回

      // 基準時刻は前方へ飛ばず、通常の now が続けば前進する。エントリは満タンへ回復し、
      // 掃除で消える（凍結したまま不滅にはならない）。
      for (let s = 1; s <= 10; s++) limiter.sweep(T0 + s * 1_000);
      expect(limiter.size()).toBe(0);
    });

    it("同じ未来の now を繰り返し渡してもバースト枠は還付されない（実経過で締める）", () => {
      // refillFullMs = 60,000ms。壊れた時計が同じ未来の値を返し続けても、実時間は
      // 1ms も経っていない。基準時刻が進んでよいのは最初の 1 回の「満タン 1 杯」ぶんだけで、
      // 呼ぶたびに満タンへ戻ってはいけない。
      const limiter = createTokenBucketLimiter({ capacity: 60, refillPerSec: 1 });
      limiter.consume("k", T0); // 稼働中の基準時刻を作る
      const farFuture = T0 + 1_000_000_000;
      let passed = 0;
      for (let i = 0; i < 200; i++) {
        if (!limiter.shouldReject("k", farFuture)) {
          limiter.consume("k", farFuture);
          passed++;
        }
      }
      // 1 回だけ満タン（60 個）へ回復し、そこから使い切って止まる。
      // 締めていなければ呼ぶたびに満タンへ戻り、200 件すべて通ってしまう。
      expect(passed).toBe(60);
    });

    it("残余: コールドスタート（1 回目の呼び出しが壊れた時計）では凍結する（意図した残余）", () => {
      // 比較する基準がまだ存在しないため、この 1 回目の値がそのまま基準時刻になる。
      // これは設計正本 D4 に明記した既知の残余であり、バグではない。
      // （旧方式の残余の真部分集合。旧方式は稼働中でも D3 の順で凍結した。）
      const limiter = createTokenBucketLimiter({ capacity: 60, refillPerSec: 1 });
      const farFuture = T0 + 100 * 365 * 24 * 60 * 60 * 1_000;
      limiter.shouldReject("k", farFuture);
      limiter.consume("k", farFuture);

      let passed = 0;
      for (let s = 1; s <= 1_000; s++) {
        const now = T0 + s * 1_000;
        if (!limiter.shouldReject("k", now)) {
          limiter.consume("k", now);
          passed++;
        }
      }
      // 残っていた 59 個を使い切ったところで止まる（補充は再開しない）。
      expect(passed).toBe(59);
    });
  });

  describe("key の異常値（Minor 1）", () => {
    it("shouldReject は文字列以外の key を拒否側へ倒す", () => {
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      expect(limiter.shouldReject(undefined as unknown as string, T0)).toBe(true);
      expect(limiter.shouldReject(null as unknown as string, T0)).toBe(true);
      expect(limiter.shouldReject(0 as unknown as string, T0)).toBe(true);
      expect(limiter.shouldReject({} as unknown as string, T0)).toBe(true);
      expect(limiter.shouldReject(Symbol("k") as unknown as string, T0)).toBe(true);
      expect(limiter.shouldReject(NaN as unknown as string, T0)).toBe(true);
    });

    it("consume は文字列以外の key では状態を書き換えない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      limiter.consume(undefined as unknown as string, T0);
      limiter.consume(null as unknown as string, T0);
      limiter.consume(0 as unknown as string, T0);
      limiter.consume({} as unknown as string, T0);
      expect(limiter.size()).toBe(0);
    });

    it("空文字は正当な key として扱う（文字列型なので個別に弾かない）", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      expect(limiter.shouldReject("", T0)).toBe(false);
      limiter.consume("", T0);
      expect(limiter.shouldReject("", T0)).toBe(true);
    });
  });
});
