/**
 * B-2 の統合可否を判定する**プロパティテスト**（fast-check）。
 *
 * 判定したかったこと:
 * 「`decide` に ineligible 集合を渡して `DriverSwitched` を返させ、それを `evolve` で
 * 適用する」形にしたとき、現在サーバーが使っている `advanceDriver` と
 * **すべての入力で同じ集約を生むか**。
 *
 * ## 結論: 同値ではない（統合すると振る舞いが変わる）
 *
 * fast-check が示した最小の反例は `[len=1, currentIndex=0, ineligible=[]]` である。
 *
 * | | `driverCounts` | `totalSwitches` |
 * |---|---|---|
 * | `evolve(DriverSwitched, nextIndex=0)` | `[1]` | `1` |
 * | `advanceDriver` | `[0]` | `0` |
 *
 * 反例の一般形は **「交代先が現ドライバーと同じになる入力」**である。
 * 具体的には次の 2 つの場合に起きる。
 *
 * 1. 輪が 1 人（`(0 + 1) % 1 === 0`）
 * 2. 現ドライバー以外が全員対象外（`nextEligibleIndex` が現状維持を返す）
 *
 * `advanceDriver` はこの場合を「交代していない」とみなして担当回数・交代回数を増やさず、
 * タイマーだけを再アンカーする。`evolve(DriverSwitched)` は index の異同を見ないため
 * 常に回数を増やす。**利用者から見える記録（担当回数・交代回数）が変わる**ので、
 * この統合は挙動を変えない変更ではない。
 *
 * → **B-2 は本計画（Issue #28・挙動不変）では実装を変えず撤退する（T077）。**
 *   統合するなら「どちらの回数が正しいか」を決める必要があり、それは振る舞いの設計判断
 *   （Issue #26 の担当範囲）である。
 *
 * @requirements FR-102, FR-114, FR-115, US3
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { evolve, advanceDriver } from "../src/evolve.js";
import { nextEligibleIndex } from "../src/aggregate.js";
import { anAggregate, NOW } from "./support/aggregate-builder.js";

const LATER = NOW + 60_000;

/** rotation の長さ・currentIndex・ineligible 集合の全組み合わせを生成する。 */
const rotationCase = fc
  .record({
    length: fc.integer({ min: 1, max: 8 }),
    currentSeed: fc.nat(),
    ineligibleSeed: fc.array(fc.nat({ max: 7 }), { maxLength: 8 }),
  })
  .map(({ length, currentSeed, ineligibleSeed }) => {
    const currentIndex = currentSeed % length;
    const ineligible = new Set(ineligibleSeed.filter((i) => i < length));
    const rotation = Array.from({ length }, (_, i) => `p${i}`);
    return { rotation, currentIndex, ineligible };
  });

/** `decide` に ineligible を渡した場合に生まれるであろう集約（統合後の姿）。 */
function viaDecideWithIneligible(
  rotation: string[],
  currentIndex: number,
  ineligible: Set<number>,
) {
  const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
  const nextIndex = nextEligibleIndex(agg.session, currentIndex, ineligible);
  return evolve(agg, { type: "DriverSwitched", nextIndex, now: LATER }, LATER);
}

/** 現在サーバーが採用している経路。 */
function viaAdvanceDriver(rotation: string[], currentIndex: number, ineligible: Set<number>) {
  const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
  return advanceDriver(agg, ineligible, LATER);
}

describe("decide への ineligible 委譲と advanceDriver の同値性", () => {
  /**
   * @requirements FR-102
   */
  describe("交代先が現ドライバーと異なる入力", () => {
    it("すべての入力で同じ集約になる", () => {
      // Given（rotation の長さ・currentIndex・ineligible 集合の全組み合わせ）
      // When / Then（前提を満たす入力だけを対象に比較する）
      fc.assert(
        fc.property(rotationCase, ({ rotation, currentIndex, ineligible }) => {
          const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
          fc.pre(nextEligibleIndex(agg.session, currentIndex, ineligible) !== currentIndex);

          expect(viaDecideWithIneligible(rotation, currentIndex, ineligible)).toEqual(
            viaAdvanceDriver(rotation, currentIndex, ineligible),
          );
        }),
        { numRuns: 2000 },
      );
    });
  });

  /**
   * ここが統合を止めた根拠である。**同値でない入力が存在する。**
   *
   * @requirements FR-102, FR-115
   */
  describe("交代先が現ドライバーと同じになる入力（反例）", () => {
    it("すべての入力で担当回数が食い違う", () => {
      // Given（rotation の長さ・currentIndex・ineligible 集合の全組み合わせ）
      // When / Then（前提を満たす入力だけを対象に比較する）
      fc.assert(
        fc.property(rotationCase, ({ rotation, currentIndex, ineligible }) => {
          const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
          fc.pre(nextEligibleIndex(agg.session, currentIndex, ineligible) === currentIndex);

          const decided = viaDecideWithIneligible(rotation, currentIndex, ineligible);
          const advanced = viaAdvanceDriver(rotation, currentIndex, ineligible);
          expect(decided.session.driverCounts[currentIndex]).toBe(
            (advanced.session.driverCounts[currentIndex] ?? 0) + 1,
          );
        }),
        { numRuns: 2000 },
      );
    });

    it("すべての入力で交代回数が食い違う", () => {
      // Given（rotation の長さ・currentIndex・ineligible 集合の全組み合わせ）
      // When / Then（前提を満たす入力だけを対象に比較する）
      fc.assert(
        fc.property(rotationCase, ({ rotation, currentIndex, ineligible }) => {
          const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
          fc.pre(nextEligibleIndex(agg.session, currentIndex, ineligible) === currentIndex);

          const decided = viaDecideWithIneligible(rotation, currentIndex, ineligible);
          const advanced = viaAdvanceDriver(rotation, currentIndex, ineligible);
          expect(decided.session.totalSwitches).toBe(advanced.session.totalSwitches + 1);
        }),
        { numRuns: 2000 },
      );
    });

    it("fast-check が最小化した反例（1人の輪・対象外なし）で食い違う", () => {
      // Given（反例 [len=1, currentIndex=0, ineligible=[]] を固定したもの）
      const rotation = ["p0"];

      // When
      const decided = viaDecideWithIneligible(rotation, 0, new Set());
      const advanced = viaAdvanceDriver(rotation, 0, new Set());

      // Then
      expect(decided.session.driverCounts).toEqual([1]);
      expect(advanced.session.driverCounts).toEqual([0]);
      expect(decided.session.totalSwitches).toBe(1);
      expect(advanced.session.totalSwitches).toBe(0);
    });
  });
});
