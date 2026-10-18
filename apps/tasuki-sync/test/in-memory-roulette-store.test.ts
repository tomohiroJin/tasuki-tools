/**
 * InMemoryRouletteStore のテスト
 */

import { describe, it, expect } from "bun:test";
import { INITIAL_ROULETTE_STATE } from "@tasuki/roulette-core";
import type { RouletteState } from "@tasuki/roulette-core";
import { InMemoryRouletteStore } from "../src/adapters/in-memory-roulette-store.js";

const SETTLED: RouletteState = {
  excluded: ["p-a"],
  guests: [{ id: "g-1", name: "ゲスト" }],
  lastSpin: {
    seq: 2,
    wheel: [
      { id: "p-b", name: "健太" },
      { id: "g-1", name: "ゲスト" },
    ],
    winnerIndex: 0,
    settle: 0.5,
    picks: [{ index: 0, settle: 0.5 }],
    spunBy: "あおい",
    startedAt: 10,
  },
  nextGuestSeq: 2,
  pickCount: 1,
  mode: "once",
  order: null,
};

/**
 * @requirements #94 E10
 */
describe("InMemoryRouletteStore", () => {
  it("置いた状態を引け、消すと引けなくなる", () => {
    // Given
    const store = new InMemoryRouletteStore();
    // When
    store.put("R1", INITIAL_ROULETTE_STATE);
    // Then
    expect(store.get("R1")).toEqual(INITIAL_ROULETTE_STATE);
    store.remove("R1");
    expect(store.get("R1")).toBeUndefined();
  });

  it("初期状態でない値も、置いたそのままを引ける", () => {
    // Given
    const store = new InMemoryRouletteStore();
    // When
    store.put("R2", SETTLED);
    // Then
    expect(store.get("R2")).toEqual(SETTLED);
  });

  it("存在しないコードは undefined を返す", () => {
    expect(new InMemoryRouletteStore().get("NOTEXIST")).toBeUndefined();
  });

  it("ルームごとに状態が独立している", () => {
    // Given: 1 つのストアに 2 つのルームの状態を置く
    const store = new InMemoryRouletteStore();
    store.put("R1", INITIAL_ROULETTE_STATE);
    store.put("R2", SETTLED);
    // When: R1 だけを消す
    store.remove("R1");
    // Then
    expect(store.get("R1")).toBeUndefined();
    expect(store.get("R2")).toEqual(SETTLED);
  });
});
