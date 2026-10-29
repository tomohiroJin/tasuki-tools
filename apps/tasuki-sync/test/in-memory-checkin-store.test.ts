/**
 * InMemoryCheckinStore のテスト
 */

import { describe, it, expect } from "bun:test";
import { INITIAL_CHECKIN_STATE } from "@tasuki/checkin-core";
import type { CheckinState } from "@tasuki/checkin-core";
import { InMemoryCheckinStore } from "../src/adapters/in-memory-checkin-store.js";

const OTHER: CheckinState = { ...INITIAL_CHECKIN_STATE, lastSeq: INITIAL_CHECKIN_STATE.lastSeq + 1 };

/**
 * @requirements #406
 */
describe("InMemoryCheckinStore", () => {
  it("置いた状態を引け、消すと引けなくなる", () => {
    const store = new InMemoryCheckinStore();
    store.put("A1", INITIAL_CHECKIN_STATE);
    expect(store.get("A1")).toEqual(INITIAL_CHECKIN_STATE);
    store.delete("A1");
    expect(store.get("A1")).toBeUndefined();
  });

  it("存在しないコードは undefined を返す", () => {
    expect(new InMemoryCheckinStore().get("NOTEXIST")).toBeUndefined();
  });

  it("ルームごとに状態が独立している", () => {
    const store = new InMemoryCheckinStore();
    store.put("A1", INITIAL_CHECKIN_STATE);
    store.put("A2", OTHER);
    store.delete("A1");
    expect(store.get("A1")).toBeUndefined();
    expect(store.get("A2")).toEqual(OTHER);
  });
});
