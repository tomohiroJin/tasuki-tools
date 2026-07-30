/**
 * member.shuffle（モブ順のランダム化）の core テスト
 * v2.3 #1: スキーマ・decide（順列検証）・evolve（現ドライバー保持の並べ替え）
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  CommandSchema,
  decide,
  evolve,
  type Aggregate,
} from "../src/index.js";
import { anAggregate } from "./support/aggregate-builder.js";

const NOW = 1_000_000;

/** rotation=["A","B","C"]・driverCounts=[1,2,3]・currentIndex 指定の集約を作る */
function aggWith(currentIndex: number): Aggregate {
  const base = anAggregate().withRotation("A", "B", "C").withCurrentDriver(currentIndex).build();
  return {
    ...base,
    session: {
      ...base.session,
      driverCounts: [1, 2, 3],
    },
  };
}

describe("CommandSchema: member.shuffle", () => {
  it("フィールド無しの member.shuffle は success", () => {
    const result = v.safeParse(CommandSchema, { command: "member.shuffle" });
    expect(result.success).toBe(true);
  });
});

describe("evolve: MembersShuffled", () => {
  it("order=[2,0,1] で rotation/driverCounts が並べ替わる", () => {
    // Given
    const agg = aggWith(0);
    const event = { type: "MembersShuffled", order: [2, 0, 1], now: NOW } as const;
    // When
    const next = evolve(agg, event, NOW);
    // Then
    expect(next.session.rotation).toEqual(["C", "A", "B"]);
    expect(next.session.driverCounts).toEqual([3, 1, 2]);
  });

  it("現ドライバー名が新しい currentIndex に remap される", () => {
    // Given（currentIndex=1（"B"）を order=[2,0,1] で並べ替えると "B" は新インデックス 2 へ）
    const agg = aggWith(1);
    const event = { type: "MembersShuffled", order: [2, 0, 1], now: NOW } as const;
    // When
    const next = evolve(agg, event, NOW);
    // Then
    expect(next.session.rotation).toEqual(["C", "A", "B"]);
    expect(next.session.rotation[next.session.currentIndex]).toBe("B");
    expect(next.session.currentIndex).toBe(2);
  });

  it("恒等順列 [0,1,2] は集約を変えない（現ドライバー保持）", () => {
    // Given
    const agg = aggWith(2);
    const event = { type: "MembersShuffled", order: [0, 1, 2], now: NOW } as const;
    // When
    const next = evolve(agg, event, NOW);
    // Then
    expect(next.session.rotation).toEqual(["A", "B", "C"]);
    expect(next.session.driverCounts).toEqual([1, 2, 3]);
    expect(next.session.currentIndex).toBe(2);
  });
});

describe("decide: member.shuffle", () => {
  const agg = aggWith(0);

  it("正しい順列は MembersShuffled を返す", () => {
    const result = decide({ command: "member.shuffle", order: [2, 0, 1] }, agg, NOW);
    expect(result._unsafeUnwrap()).toEqual([{ type: "MembersShuffled", order: [2, 0, 1], now: NOW }]);
  });

  it("重複を含む order [0,0,1] は InvalidIndex で err", () => {
    const result = decide({ command: "member.shuffle", order: [0, 0, 1] }, agg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });

  it("範囲外を含む order [0,1,3] は InvalidIndex で err", () => {
    const result = decide({ command: "member.shuffle", order: [0, 1, 3] }, agg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });

  it("長さ不一致の order [0,1] は InvalidIndex で err", () => {
    const result = decide({ command: "member.shuffle", order: [0, 1] }, agg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });
});
