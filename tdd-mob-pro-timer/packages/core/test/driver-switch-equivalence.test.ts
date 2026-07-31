/**
 * B-2 の統合結果を検証する**プロパティテスト**（fast-check）。
 *
 * ## このファイルの役割の変化
 *
 * 統合前、このファイルは「`decide` に ineligible 集合を渡して `DriverSwitched` を返させ、
 * それを `evolve` で適用する」形と、現在サーバーが使っている `advanceDriver` が
 * **すべての入力で一致しない**ことを証明していた。fast-check が示した最小の反例は
 * `[len=1, currentIndex=0, ineligible=[]]` であり、「交代先が現ドライバーと同じになる
 * 入力」で `driverCounts`/`totalSwitches` の加算有無が食い違っていた（`advanceDriver` は
 * 加算せず、`evolve(DriverSwitched)` は index の異同を見ずに常に加算していたため）。
 *
 * ## 統合後（本ファイル）: 同値であることの証明
 *
 * `evolveDriverSwitched`（`evolve.ts`）を「`nextIndex === prevIndex` のとき加算しない」
 * 意味論に修正し、`advanceDriver` をその1行ラッパへ縮退させたことで、
 * 「`decide`（ineligible付き）→`evolve`」経路と `advanceDriver` は**すべての入力で
 * 同じ集約を生む**（同値）。旧ファイルが反例として固定していた
 * `[len=1, currentIndex=0, ineligible=[]]` を含め、fast-check 2000回で検証する。
 *
 * @requirements FR-163, FR-164, FR-166, FR-167, SC-056
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

/** `decide` に ineligible を渡した場合に生まれる集約（統合後の経路）。 */
function viaDecideWithIneligible(
  rotation: string[],
  currentIndex: number,
  ineligible: Set<number>,
) {
  const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
  const nextIndex = nextEligibleIndex(agg.session, currentIndex, ineligible);
  return evolve(agg, { type: "DriverSwitched", nextIndex, now: LATER }, LATER);
}

/** 現在サーバーが採用している経路（自動交代・driver.skip の即時繰り上げ）。 */
function viaAdvanceDriver(rotation: string[], currentIndex: number, ineligible: Set<number>) {
  const agg = anAggregate().withRotation(...rotation).withCurrentDriver(currentIndex).running().build();
  return advanceDriver(agg, ineligible, LATER);
}

describe("decide への ineligible 委譲と advanceDriver の同値性（統合後）", () => {
  /**
   * @requirements FR-167, SC-056
   */
  it("すべての入力（交代先が現ドライバーと異なる場合も同じ場合も）で同じ集約になる", () => {
    // Given（rotation の長さ・currentIndex・ineligible 集合の全組み合わせ）
    // When / Then
    fc.assert(
      fc.property(rotationCase, ({ rotation, currentIndex, ineligible }) => {
        expect(viaDecideWithIneligible(rotation, currentIndex, ineligible)).toEqual(
          viaAdvanceDriver(rotation, currentIndex, ineligible),
        );
      }),
      { numRuns: 2000 },
    );
  });

  /**
   * 旧ファイルが反例として固定していた入力（統合前は食い違っていた）を、
   * 統合後は一致することの直接証拠として残す。
   *
   * @requirements FR-163, FR-166
   */
  it("旧反例（1人の輪・対象外なし）でも一致する", () => {
    // Given（旧反例 [len=1, currentIndex=0, ineligible=[]]）
    const rotation = ["p0"];

    // When
    const decided = viaDecideWithIneligible(rotation, 0, new Set());
    const advanced = viaAdvanceDriver(rotation, 0, new Set());

    // Then
    expect(decided).toEqual(advanced);
    expect(decided.session.driverCounts).toEqual([0]);
    expect(decided.session.totalSwitches).toBe(0);
  });
});
