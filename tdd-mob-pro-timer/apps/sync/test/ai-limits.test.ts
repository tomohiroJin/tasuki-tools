import { describe, it, expect } from "vitest";
import { AiLimiter } from "../src/application/ai-limits.js";
import type { Clock } from "../src/ports/clock.js";

/** テスト用の可変クロック */
function makeClock(start: number): Clock & { advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("AiLimiter", () => {
  it("初回は取得でき、release 前の同一ルーム再取得は concurrent で拒否", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10 });
    const a = limiter.tryAcquire("R1");
    expect(a.ok).toBe(true);
    const b = limiter.tryAcquire("R2");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe("concurrent");
  });

  it("release 後でもクールダウン中は同一ルームを cooldown で拒否、別ルームは取得可", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 10_000 });
    const a = limiter.tryAcquire("R1");
    expect(a.ok).toBe(true);
    if (a.ok) a.release();
    const again = limiter.tryAcquire("R1");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("cooldown");
    const other = limiter.tryAcquire("R2");
    expect(other.ok).toBe(true);
  });

  it("クールダウン経過後は同一ルームでも再取得できる", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 10_000 });
    const a = limiter.tryAcquire("R1");
    if (a.ok) a.release();
    clock.advance(10_001);
    expect(limiter.tryAcquire("R1").ok).toBe(true);
  });

  it("日次上限に達すると daily で拒否し、日付が変わるとリセットされる", () => {
    const clock = makeClock(Date.UTC(2026, 5, 12, 23, 50));
    const limiter = new AiLimiter({ clock, dailyLimit: 2, cooldownMs: 0 });
    for (const room of ["R1", "R2"]) {
      const r = limiter.tryAcquire(room);
      expect(r.ok).toBe(true);
      if (r.ok) r.release();
    }
    const over = limiter.tryAcquire("R3");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("daily");
    // UTC 日付が変わるとリセット
    clock.advance(11 * 60 * 1000);
    expect(limiter.tryAcquire("R3").ok).toBe(true);
  });

  it("todayCount / totalCount が取得成功数を数える", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const a = limiter.tryAcquire("R1");
    if (a.ok) a.release();
    const b = limiter.tryAcquire("R1");
    if (b.ok) b.release();
    expect(limiter.todayCount).toBe(2);
    expect(limiter.totalCount).toBe(2);
  });
});
