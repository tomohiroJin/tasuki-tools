/**
 * ドライバー交代の**特性テスト**（characterization test）。
 *
 * 統合前、`apps/sync` の `handlers.ts` は `session.act SWITCH` を受けたとき、
 * `decide()` が返した `DriverSwitched.nextIndex` を**採用せず**、
 * `advanceDriver()` の結果で置き換えていた（B-2 / FR-102 違反）。
 *
 * このファイルは**当時そうなっていた振る舞いを固定した**ものである。ここに書かれているのは
 * 「望ましい仕様」ではなく「実装が実際にどう動くか」であり、B-2 統合（decide に ineligible を
 * 渡して置き換え分岐を撤去する）の後もユーザーに見える値（担当回数・交代回数・現在ドライバー）は
 * 変わらないことの直接証拠として、「decide が返す交代先」「advanceDriver による交代」の各節は
 * 統合後もそのまま緑であり続ける（値は1つも変更していない）。
 *
 * 旧「2 つの実装の食い違い」節（`evolve(DriverSwitched)` を decide の生の結果に直接適用した
 * 場合と `advanceDriver` が一致しないことを示す節）は、B-2 統合そのものによってこの食い違いが
 * 解消されたため、事後的に成立しなくなった（`evolveDriverSwitched` を修正し `advanceDriver` は
 * その1行ラッパへ縮退したため、両者は必然的に一致する）。この食い違いの解消は
 * `driver-switch-equivalence.test.ts` が本来の役割として証明するため、本ファイルでは
 * 「解消済みであることの確認」に節を書き換えた（旧節の「食い違う」という主張自体を
 * そのまま残すと、統合が完了した実装に対して失敗し続ける矛盾したテストになるため）。
 *
 * @requirements FR-102, FR-114, FR-163, FR-166, US3
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
   * B-2 統合により解消された食い違いの確認。統合前はここで
   * 「1人だけの輪では evolve(DriverSwitched) は担当回数/交代回数を増やすが
   * advanceDriver は増やさない」という食い違いが起きていたが、`evolveDriverSwitched`
   * を advanceDriver 準拠（`nextIndex === prevIndex` なら加算しない）に修正し、
   * `advanceDriver` をその1行ラッパへ縮退させたことで、decide の生の結果を直接 evolve
   * しても advanceDriver と一致するようになった。全入力での一致は
   * `driver-switch-equivalence.test.ts` が fast-check で証明する。
   *
   * @requirements FR-102, FR-163, FR-166
   */
  describe("2 つの実装の食い違い（統合により解消）", () => {
    it("1人だけの輪では、evolve(DriverSwitched) も advanceDriver も担当回数を増やさない", () => {
      // Given（輪が 1 人。decide の nextIndex は (0+1)%1 = 0 ＝ 自分自身になる）
      const agg = anAggregate().withRotation("p1").withCurrentDriver(0).running().build();
      const decided = decide({ command: "session.act", action: "SWITCH" }, agg, LATER)._unsafeUnwrap();

      // When
      const byEvolve = decided.reduce((a, event) => evolve(a, event, LATER), agg);
      const byAdvance = advanceDriver(agg, new Set(), LATER);

      // Then
      expect(byEvolve.session.driverCounts).toEqual([0]);
      expect(byAdvance.session.driverCounts).toEqual([0]);
    });

    it("1人だけの輪では、evolve(DriverSwitched) も advanceDriver も交代回数を増やさない", () => {
      // Given
      const agg = anAggregate().withRotation("p1").withCurrentDriver(0).running().build();
      const decided = decide({ command: "session.act", action: "SWITCH" }, agg, LATER)._unsafeUnwrap();

      // When
      const byEvolve = decided.reduce((a, event) => evolve(a, event, LATER), agg);
      const byAdvance = advanceDriver(agg, new Set(), LATER);

      // Then
      expect(byEvolve.session.totalSwitches).toBe(0);
      expect(byAdvance.session.totalSwitches).toBe(0);
    });
  });
});
