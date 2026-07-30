/**
 * ドライバー交代の**特性テスト**（characterization test）。
 *
 * `apps/sync` の `handlers.ts` は `session.act SWITCH` を受けたとき、
 * `decide()` が返した `DriverSwitched.nextIndex` を**採用せず**、
 * `advanceDriver()` の結果で置き換えている（B-2 / FR-102 違反）。
 *
 * このファイルは**現在そうなっている振る舞いを固定する**。ここに書かれているのは
 * 「望ましい仕様」ではなく「今の実装が実際にどう動くか」である。
 * 統合（`decide` に ineligible を渡して置き換え分岐を撤去する）が
 * 振る舞いを変えないかどうかは `driver-switch-equivalence.test.ts` が判定する。
 *
 * @requirements FR-102, FR-114, US3
 */

import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { evolve, advanceDriver } from "../src/evolve.js";
import { anAggregate, NOW } from "./support/aggregate-builder.js";

const LATER = NOW + 60_000;

describe("ドライバーの交代（現在の振る舞い）", () => {
  /**
   * @requirements FR-102
   */
  describe("decide が返す交代先", () => {
    it("誰が対象外かに関わらず、輪の次の位置を指す", () => {
      // Given
      const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

      // When
      const result = decide({ command: "session.act", action: "SWITCH" }, agg, LATER);

      // Then（decide は ineligible を受け取らないため、隣を指すことしかできない）
      const switched = result._unsafeUnwrap().find((e) => e.type === "DriverSwitched");
      expect(switched).toEqual({ type: "DriverSwitched", nextIndex: 1, now: LATER });
    });

    it("停止中の交代は拒否される", () => {
      // Given
      const agg = anAggregate().withRotation("p1", "p2").build();

      // When
      const result = decide({ command: "session.act", action: "SWITCH" }, agg, LATER);

      // Then
      expect(result._unsafeUnwrapErr().type).toBe("PhaseConflict");
    });
  });

  /**
   * `handlers.ts` は手動交代でも自動交代でも `advanceDriver` を通す。
   * したがって利用者が観測する交代の振る舞いはこちらである。
   *
   * @requirements FR-102, FR-114
   */
  describe("advanceDriver による交代（サーバーが実際に採用している経路）", () => {
    it("対象外が居なければ、輪の次の人がドライバーになる", () => {
      // Given
      const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

      // When
      const next = advanceDriver(agg, new Set(), LATER);

      // Then
      expect(next.session.currentIndex).toBe(1);
    });

    it("対象外の人を飛ばして次の対象者がドライバーになる", () => {
      // Given（p2 が一時離脱中）
      const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

      // When
      const next = advanceDriver(agg, new Set([1]), LATER);

      // Then
      expect(next.session.currentIndex).toBe(2);
    });

    it("交代すると、前のドライバーの担当回数と交代回数が増える", () => {
      // Given
      const agg = anAggregate().withRotation("p1", "p2").withCurrentDriver(0).running().build();

      // When
      const next = advanceDriver(agg, new Set(), LATER);

      // Then
      expect(next.session.driverCounts).toEqual([1, 0]);
      expect(next.session.totalSwitches).toBe(agg.session.totalSwitches + 1);
    });

    it("自分以外が全員対象外なら、ドライバーは変わらない", () => {
      // Given（p2 も p3 も対象外）
      const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

      // When
      const next = advanceDriver(agg, new Set([1, 2]), LATER);

      // Then
      expect(next.session.currentIndex).toBe(0);
    });

    it("ドライバーが変わらないときは、担当回数も交代回数も増えない", () => {
      // Given
      const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

      // When
      const next = advanceDriver(agg, new Set([1, 2]), LATER);

      // Then（回数を増やすと「一度も交代していないのに交代回数が増える」記録になる）
      expect(next.session.driverCounts).toEqual(agg.session.driverCounts);
      expect(next.session.totalSwitches).toBe(agg.session.totalSwitches);
    });

    it("ドライバーが変わらないときでも、持ち時間は満タンから測り直される", () => {
      // Given
      const agg = anAggregate().withRotation("p1").withCurrentDriver(0).running().build();

      // When
      const next = advanceDriver(agg, new Set(), LATER);

      // Then（再アンカーしないと残り0のまま自動交代が即再発火して無限ループになる）
      expect(next.clock.secondsLeftAtAnchor).toBe(agg.clock.intervalSeconds);
      expect(next.clock.anchorServerTime).toBe(LATER);
    });
  });

  /**
   * B-2 の核心。**同じ「交代」という操作に 2 つの実装があり、結果が食い違う入力が存在する。**
   *
   * @requirements FR-102
   */
  describe("2 つの実装の食い違い", () => {
    it("1人だけの輪では、evolve(DriverSwitched) は担当回数を増やすが advanceDriver は増やさない", () => {
      // Given（輪が 1 人。decide の nextIndex は (0+1)%1 = 0 ＝ 自分自身になる）
      const agg = anAggregate().withRotation("p1").withCurrentDriver(0).running().build();
      const decided = decide({ command: "session.act", action: "SWITCH" }, agg, LATER)._unsafeUnwrap();

      // When
      const byEvolve = decided.reduce((a, event) => evolve(a, event, LATER), agg);
      const byAdvance = advanceDriver(agg, new Set(), LATER);

      // Then
      expect(byEvolve.session.driverCounts).toEqual([1]);
      expect(byAdvance.session.driverCounts).toEqual([0]);
    });

    it("1人だけの輪では、evolve(DriverSwitched) は交代回数を増やすが advanceDriver は増やさない", () => {
      // Given
      const agg = anAggregate().withRotation("p1").withCurrentDriver(0).running().build();
      const decided = decide({ command: "session.act", action: "SWITCH" }, agg, LATER)._unsafeUnwrap();

      // When
      const byEvolve = decided.reduce((a, event) => evolve(a, event, LATER), agg);
      const byAdvance = advanceDriver(agg, new Set(), LATER);

      // Then
      expect(byEvolve.session.totalSwitches).toBe(1);
      expect(byAdvance.session.totalSwitches).toBe(0);
    });
  });
});
