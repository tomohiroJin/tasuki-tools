/**
 * InMemoryTrackStore のテスト
 */

import { describe, it, expect } from "bun:test";
import { createTrackState, type TrackState } from "@tasuki/track-core";
import { InMemoryTrackStore } from "../src/adapters/in-memory-track-store.js";

const FIRST: TrackState = createTrackState({ mono: 1, wallMs: 10 });
const SECOND: TrackState = createTrackState({ mono: 2, wallMs: 20 });

/**
 * @requirements #476
 */
describe("InMemoryTrackStore", () => {
  it("置いた状態を引け、消すと引けなくなる", () => {
    const store = new InMemoryTrackStore();
    store.put("A1", FIRST);
    expect(store.get("A1")).toBe(FIRST);
    store.remove("A1");
    expect(store.get("A1")).toBeUndefined();
  });

  it("存在しないコードは undefined を返す", () => {
    expect(new InMemoryTrackStore().get("NOTEXIST")).toBeUndefined();
  });

  it("ルームごとに状態が独立している", () => {
    const store = new InMemoryTrackStore();
    store.put("A1", FIRST);
    store.put("A2", SECOND);
    store.remove("A1");
    expect(store.get("A1")).toBeUndefined();
    expect(store.get("A2")).toBe(SECOND);
  });
});
