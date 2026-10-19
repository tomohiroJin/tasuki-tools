/**
 * InMemoryAgendaStore のテスト
 */

import { describe, it, expect } from "bun:test";
import { INITIAL_AGENDA_STATE } from "@tasuki/agenda-core";
import type { AgendaState } from "@tasuki/agenda-core";
import { InMemoryAgendaStore } from "../src/adapters/in-memory-agenda-store.js";

const TITLED: AgendaState = { ...INITIAL_AGENDA_STATE, title: "ふりかえり" };

/**
 * @requirements #429
 */
describe("InMemoryAgendaStore", () => {
  it("置いた状態を引け、消すと引けなくなる", () => {
    const store = new InMemoryAgendaStore();
    store.put("A1", INITIAL_AGENDA_STATE);
    expect(store.get("A1")).toEqual(INITIAL_AGENDA_STATE);
    store.remove("A1");
    expect(store.get("A1")).toBeUndefined();
  });

  it("存在しないコードは undefined を返す", () => {
    expect(new InMemoryAgendaStore().get("NOTEXIST")).toBeUndefined();
  });

  it("ルームごとに状態が独立している", () => {
    const store = new InMemoryAgendaStore();
    store.put("A1", INITIAL_AGENDA_STATE);
    store.put("A2", TITLED);
    store.remove("A1");
    expect(store.get("A1")).toBeUndefined();
    expect(store.get("A2")).toEqual(TITLED);
  });
});
