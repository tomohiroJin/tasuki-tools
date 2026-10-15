/**
 * 休憩と設定の phase の事前条件（#402 設計 §4.4）。
 * 集約は phase を持たないので、decide ではなくサーバーの事前条件が見る。
 */
import { describe, it, expect } from "bun:test";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { roomViewOf, participantIdOfConn } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/** ホストと 2 人目が輪に並んだロビー（phase は setup）。 */
async function setupLobby() {
  const store = new InMemoryRoomStore();
  const timers = new InMemoryTimerStore();
  const handlers = makeTestHandlers({
    store,
    timers,
    clock: new FakeClock(1000000),
    broadcaster: new SpyBroadcaster(),
    codeGen: new FakeCodeGen(),
  });
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: "Alice",
    config: { intervalMinutes: 5 },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = store.list().at(-1)!.code;
  const join = await handlers.handleCommand("bob-conn", { command: "room.join", code, displayName: "Bob" });
  if (!join.isOk()) throw new Error("join failed");
  const add = await handlers.handleCommand("bob-conn", {
    command: "member.add",
    participantId: participantIdOfConn(store, "bob-conn"),
  });
  if (!add.isOk()) throw new Error("member.add failed");
  return { handlers, store, timers, code };
}

/** 画面の startSession と同じ順（phase.set → START）でセッションを始めた状態。 */
async function setupRunning() {
  const ctx = await setupLobby();
  const phase = await ctx.handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
  if (!phase.isOk()) throw new Error("phase.set failed");
  const start = await ctx.handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
  if (!start.isOk()) throw new Error("START failed");
  return ctx;
}

describe("休憩と設定の phase の事前条件（#402 設計 §4.4）", () => {
  it("Given ロビー / When break.start / Then NOT_IN_SESSION で拒む", async () => {
    const { handlers } = await setupLobby();
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    expect(r._unsafeUnwrapErr()).toBe("NOT_IN_SESSION");
  });

  it("Given ロビー / When break.end / Then NOT_IN_SESSION で拒む", async () => {
    const { handlers } = await setupLobby();
    const r = await handlers.handleCommand("host-conn", { command: "break.end" });
    expect(r._unsafeUnwrapErr()).toBe("NOT_IN_SESSION");
  });

  it("Given セッション中 / When config.set / Then CONFIG_LOCKED_IN_SESSION で拒み、設定は変わらない", async () => {
    const { handlers, store, timers, code } = await setupRunning();
    const r = await handlers.handleCommand("host-conn", { command: "config.set", config: { intervalMinutes: 10 } });
    expect(r._unsafeUnwrapErr()).toBe("CONFIG_LOCKED_IN_SESSION");
    expect(roomViewOf(store, timers, code).config.intervalMinutes).toBe(5);
  });

  it("Given ロビー / When config.set / Then 通る", async () => {
    const { handlers, store, timers, code } = await setupLobby();
    const r = await handlers.handleCommand("host-conn", { command: "config.set", config: { intervalMinutes: 10 } });
    expect(r.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).config.intervalMinutes).toBe(10);
  });

  it("Given セッション中 / When break.start / Then 全員の snapshot が休憩中になる", async () => {
    const { handlers, store, timers, code } = await setupRunning();
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    expect(r.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).onBreak).toBe(true);
  });
});
