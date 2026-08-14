/**
 * トークンバケツのテスト。
 *
 * `now` を引数で受けるので、実時間に一切依存しない（タイマーも sleep も使わない）。
 */
import { describe, it, expect } from "vitest";
import { createTokenBucketLimiter } from "../src/index.js";

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
  });
});
