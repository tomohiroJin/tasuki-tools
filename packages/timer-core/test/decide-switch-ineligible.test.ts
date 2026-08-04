/**
 * decide の session.act SWITCH に ineligible を渡した場合の振る舞い（B-2 統合・G3）。
 *
 * `decide` はこれまで「輪の次の位置」を無条件に返していたが、`handleRoomCommand` 側で
 * `advanceDriver`（対象外を飛ばす実装）に差し替えられていた（決定の握り潰し）。
 * この統合により `decide` 自身が対象外を考慮できるようにする。`ineligible` は任意
 * （省略可能）であり、省略時は従来通り「隣の位置」を返す（後方互換）。
 *
 * @requirements FR-165, FR-167
 */

import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { anAggregate, NOW } from "./support/aggregate-builder.js";

const LATER = NOW + 60_000;

describe("decide: session.act SWITCH の ineligible", () => {
  it("ineligible を渡さなければ、従来通り隣の位置を返す", () => {
    // Given
    const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

    // When
    const result = decide({ command: "session.act", action: "SWITCH" }, agg, LATER);

    // Then
    const switched = result._unsafeUnwrap().find((e) => e.type === "DriverSwitched");
    expect(switched).toEqual({ type: "DriverSwitched", nextIndex: 1, now: LATER });
  });

  it("ineligible を渡すと、対象外を飛ばした次の対象がドライバーになる", () => {
    // Given（p2 が一時離脱中）
    const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

    // When
    const result = decide(
      { command: "session.act", action: "SWITCH", ineligible: new Set([1]) },
      agg,
      LATER,
    );

    // Then
    const switched = result._unsafeUnwrap().find((e) => e.type === "DriverSwitched");
    expect(switched).toEqual({ type: "DriverSwitched", nextIndex: 2, now: LATER });
  });

  it("全員対象外なら、現ドライバーのまま（nextIndex = currentIndex）を返す", () => {
    // Given（p2 も p3 も対象外）
    const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(0).running().build();

    // When
    const result = decide(
      { command: "session.act", action: "SWITCH", ineligible: new Set([1, 2]) },
      agg,
      LATER,
    );

    // Then
    const switched = result._unsafeUnwrap().find((e) => e.type === "DriverSwitched");
    expect(switched).toEqual({ type: "DriverSwitched", nextIndex: 0, now: LATER });
  });
});
