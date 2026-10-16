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
import type { BreakPolicy } from "@tasuki/timer-core";

/** 休憩ありのルーム。間隔は長く取り、テストの間に自動で休憩へ入らないようにする */
const ELAPSED_60: BreakPolicy = { trigger: "elapsed", every: 60, mode: "auto" };

/** ホストと 2 人目が輪に並んだロビー（phase は setup）。休憩の条件は既定で無し。 */
async function setupLobby(policy?: BreakPolicy) {
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
    config: policy === undefined ? { intervalMinutes: 5 } : { intervalMinutes: 5, break: policy },
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
async function setupRunning(policy?: BreakPolicy) {
  const ctx = await setupLobby(policy);
  const phase = await ctx.handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
  if (!phase.isOk()) throw new Error("phase.set failed");
  const start = await ctx.handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
  if (!start.isOk()) throw new Error("START failed");
  return ctx;
}

/** @requirements #402 */
describe("休憩と設定の phase の事前条件", () => {
  it("Given ロビー / When break.start / Then NOT_IN_SESSION で拒む", async () => {
    // Given
    const { handlers } = await setupLobby();
    // When
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    // Then
    expect(r._unsafeUnwrapErr()).toBe("NOT_IN_SESSION");
  });

  it("Given ロビー / When break.end / Then NOT_IN_SESSION で拒む", async () => {
    // Given
    const { handlers } = await setupLobby();
    // When
    const r = await handlers.handleCommand("host-conn", { command: "break.end" });
    // Then
    expect(r._unsafeUnwrapErr()).toBe("NOT_IN_SESSION");
  });

  it("Given セッション中 / When config.set / Then CONFIG_LOCKED_IN_SESSION で拒み、設定は変わらない", async () => {
    // Given
    const { handlers, store, timers, code } = await setupRunning();
    // When
    const r = await handlers.handleCommand("host-conn", { command: "config.set", config: { intervalMinutes: 10 } });
    // Then
    expect(r._unsafeUnwrapErr()).toBe("CONFIG_LOCKED_IN_SESSION");
    expect(roomViewOf(store, timers, code).config.intervalMinutes).toBe(5);
  });

  it("Given ロビー / When config.set / Then 通る", async () => {
    // Given
    const { handlers, store, timers, code } = await setupLobby();
    // When
    const r = await handlers.handleCommand("host-conn", { command: "config.set", config: { intervalMinutes: 10 } });
    // Then
    expect(r.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).config.intervalMinutes).toBe(10);
  });

  it("Given 休憩ありのセッション中 / When break.start / Then 全員の snapshot が休憩中になる", async () => {
    // Given
    const { handlers, store, timers, code } = await setupRunning(ELAPSED_60);
    // When
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    // Then
    expect(r.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).onBreak).toBe(true);
  });

  // 条件「なし」のルームの画面は「休憩する」を出さない。古い画面や手で組んだフレームが送っても、
  // サーバーが同じ線を引く（総合レビューの Minor・2026-10-16）
  it.each([
    ["休憩の設定が無い", undefined],
    ["条件が none", { trigger: "none", every: 0, mode: "auto" } as BreakPolicy],
  ])("Given %s ルームのセッション中 / When break.start / Then BREAK_DISABLED で拒み、休憩中にならない", async (_label, policy) => {
    // Given
    const { handlers, store, timers, code } = await setupRunning(policy);
    // When
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    // Then
    expect(r._unsafeUnwrapErr()).toBe("BREAK_DISABLED");
    expect(roomViewOf(store, timers, code).onBreak).toBe(false);
  });

  it("Given 条件なしのルームのセッション中 / When break.end / Then BREAK_DISABLED では拒まない（明ける経路は塞がない）", async () => {
    // Given
    const { handlers } = await setupRunning();
    // When
    const r = await handlers.handleCommand("host-conn", { command: "break.end" });
    // Then
    // 休憩中でないので decide が NotOnBreak で拒む。事前条件の BREAK_DISABLED ではないことを見る
    expect(r.isErr() ? r.error : "ok").not.toBe("BREAK_DISABLED");
  });
});
