/**
 * 入室が混雑で弾かれたときの再試行方針（#147）。
 *
 * #103 でレート制限が接続単位から **IP 単位**へ変わり、同一 NAT の利用者はバケツを
 * 共有するようになった。バースト容量を超えて復帰した人は `JOIN_RATE_LIMITED` を受け、
 * **接続済み・未入室のまま滞留する**（自分でリロードするまで復帰しない）。
 *
 * ここで固定するのは方針の値そのものではなく、**方針が満たすべき性質**である。
 *
 * @requirements #147
 */
import { describe, it, expect } from "vitest";
import { joinRetryDelayMs, JOIN_RETRY_MAX_ATTEMPTS } from "../../src/sync/join-retry.js";

describe("入室の再試行方針", () => {
  it("待ち時間は回を追うごとに伸び、上限で頭打ちになる", () => {
    // Given: ばらつきを中央に固定して、伸び方だけを見る
    const mid = () => 0.5;
    // When
    const delays = Array.from({ length: JOIN_RETRY_MAX_ATTEMPTS }, (_, i) =>
      joinRetryDelayMs(i + 1, mid),
    );
    // Then: 単調非減少で、最後は上限に張り付く
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!, `${i + 1} 回目`).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
    expect(delays[0]!).toBeLessThan(delays[delays.length - 1]!);
    expect(delays[delays.length - 1]).toBe(delays[delays.length - 2]);
  });

  it("同じ回でもばらつきがあり、同時に切れた人どうしがぶつからない", () => {
    // Given: ばらつきの下端と上端
    // When
    const low = joinRetryDelayMs(1, () => 0)!;
    const high = joinRetryDelayMs(1, () => 0.999999)!;
    // Then: 同着を避けられる幅がある
    expect(high).toBeGreaterThan(low * 1.5);
  });

  it("ばらつきがあっても待ち時間は必ず正で、際限なく伸びない", () => {
    // Given: 取りうる乱数の端と中間
    const randoms = [0, 0.25, 0.5, 0.75, 0.999999];
    // When / Then
    for (const r of randoms) {
      for (let attempt = 1; attempt <= JOIN_RETRY_MAX_ATTEMPTS; attempt++) {
        const delay = joinRetryDelayMs(attempt, () => r)!;
        expect(delay, `attempt=${attempt} r=${r}`).toBeGreaterThan(0);
        expect(delay, `attempt=${attempt} r=${r}`).toBeLessThanOrEqual(45_000);
      }
    }
  });

  it("上限を超えた回は諦めを表す null を返す（無限に試み続けない）", () => {
    // Given / When / Then
    expect(joinRetryDelayMs(JOIN_RETRY_MAX_ATTEMPTS, () => 0.5)).not.toBeNull();
    expect(joinRetryDelayMs(JOIN_RETRY_MAX_ATTEMPTS + 1, () => 0.5)).toBeNull();
  });

  it("諦めるまでの合計は、実測で超過した人数ぶんの補充を待てる長さがある", () => {
    // Given: バケツの補充は毎秒 1（#103 設計正本 D2）。実測では 40 人が超過した
    const mid = () => 0.5;
    // When
    const total = Array.from({ length: JOIN_RETRY_MAX_ATTEMPTS }, (_, i) =>
      joinRetryDelayMs(i + 1, mid),
    ).reduce<number>((a, b) => a + (b ?? 0), 0);
    // Then
    expect(total).toBeGreaterThanOrEqual(60_000);
  });
});
