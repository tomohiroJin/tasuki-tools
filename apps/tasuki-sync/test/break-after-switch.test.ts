/**
 * 交代のあとの休憩の判定・休憩明けの繰り上げ・休憩の notice（#402 設計 §4.1〜§4.3）。
 *
 * 組み立ては画面と同じ順（phase.set session → START）。休憩の判定は phase を見るので、
 * この順を踏まないと事前条件で break.start が拒まれる。
 * 経過時間は FakeClock とハンドラ経由で実際に進める（`putRoomView` は baseline を初期値で埋めるので使わない）。
 */
import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test";
import { INITIAL_BREAK_STATE, rotationEntryId, type BreakPolicy } from "@tasuki/timer-core";
import { makeTestHandlers } from "./support/room-builder.js";
import { Scheduler } from "../src/application/schedule.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { participantIdOfConn } from "./support/room-view.js";

const INTERVAL_MS = 5 * 60 * 1000;
const ROUNDS_1: BreakPolicy = { trigger: "rounds", every: 1, mode: "auto" };
const NO_BREAK: BreakPolicy = { trigger: "none", every: 0, mode: "auto" };
/** 手で休憩するテスト用。条件「なし」では break.start が拒まれる（BREAK_DISABLED）ので、自動では入らない長い間隔にする */
const MANUAL_ONLY: BreakPolicy = { trigger: "elapsed", every: 120, mode: "auto" };

interface Ctx {
  handlers: ReturnType<typeof makeTestHandlers>;
  store: InMemoryRoomStore;
  timers: InMemoryTimerStore;
  clock: FakeClock;
  broadcaster: SpyBroadcaster;
  code: string;
}

let scheduler: Scheduler | undefined;

/** 3 人（Alice・Bob・Charlie）が輪に居て、セッション中で走っているルーム。`joiners` を空にすると Alice 1 人の輪 */
async function setupRunning(
  policy: BreakPolicy,
  joiners: readonly (readonly [string, string])[] = [["bob-conn", "Bob"], ["charlie-conn", "Charlie"]],
): Promise<Ctx> {
  const store = new InMemoryRoomStore();
  const timers = new InMemoryTimerStore();
  const broadcaster = new SpyBroadcaster();
  const clock = new FakeClock(1_000_000);
  scheduler = new Scheduler(clock);
  const handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen(), scheduler });
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: "Alice",
    config: { intervalMinutes: 5, break: policy },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = store.list().at(-1)!.code;
  for (const [connId, displayName] of joiners) {
    const join = await handlers.handleCommand(connId, { command: "room.join", code, displayName });
    if (!join.isOk()) throw new Error(`join failed: ${displayName}`);
    const add = await handlers.handleCommand(connId, { command: "member.add", participantId: participantIdOfConn(store, connId) });
    if (!add.isOk()) throw new Error(`member.add failed: ${displayName}`);
  }
  const phase = await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
  if (!phase.isOk()) throw new Error("phase.set failed");
  const start = await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
  if (!start.isOk()) throw new Error("START failed");
  return { handlers, store, timers, clock, broadcaster, code };
}

/** FakeClock を進めつつ次の自動交代を発火させる（クロックとタイマーを同期前進）。 */
function advanceOneSwitch(h: Ctx): void {
  h.clock.advance(INTERVAL_MS);
  jest.advanceTimersByTime(INTERVAL_MS + 100);
}

const timerOf = (h: Ctx) => h.timers.get(h.code)!;

function idOf(h: Ctx, connId: string): string {
  return participantIdOfConn(h.store, connId);
}

function currentDriverId(h: Ctx): string {
  const { session } = timerOf(h);
  return rotationEntryId(session.rotation[session.currentIndex]!);
}

function connOf(h: Ctx, participantId: string): string {
  for (const connId of ["host-conn", "bob-conn", "charlie-conn"]) {
    if (idOf(h, connId) === participantId) return connId;
  }
  throw new Error("conn not found");
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  scheduler?.clearAll();
  jest.useRealTimers();
});

describe("交代が起きたら休憩の条件を判定する（#402 設計 §4.1）", () => {
  // 交代の経路を名指しせずに覆うことを、経路ごとに確かめる。
  it.each([
    ["自動交代", async (h: Ctx) => { for (let i = 0; i < 3; i++) advanceOneSwitch(h); }],
    ["手での交代", async (h: Ctx) => {
      for (let i = 0; i < 3; i++) await h.handlers.handleCommand("host-conn", { command: "session.act", action: "SWITCH" });
    }],
    ["強制指名", async (h: Ctx) => {
      for (const conn of ["bob-conn", "charlie-conn", "host-conn"]) {
        await h.handlers.handleCommand("host-conn", { command: "driver.assign", participantId: idOf(h, conn) });
      }
    }],
  ] as const)("Given 周回 1・自動・3 人 / When %s で 3 回交代 / Then 休憩に入り、時計は満タンで止まる", async (_label, act) => {
    const h = await setupRunning(ROUNDS_1);
    await act(h);
    const timer = timerOf(h);
    expect(timer.session.break.since).not.toBeNull();
    expect(timer.clock.running).toBe(false);
    expect(timer.clock.secondsLeftAtAnchor).toBe(timer.clock.intervalSeconds);
  });

  // 判定が applyAfterEffects の「あと」にあることを確かめる唯一の経路（繰り上げの交代は事後処理で起きる）。
  it("Given 周回 1・自動・2 回交代済み / When 運転者が自分を driver.skip して繰り上げで 3 回目の交代が起きる / Then 休憩に入る", async () => {
    const h = await setupRunning(ROUNDS_1);
    advanceOneSwitch(h);
    advanceOneSwitch(h);
    expect(timerOf(h).session.break.since).toBeNull();
    const driver = currentDriverId(h);
    const r = await h.handlers.handleCommand(connOf(h, driver), { command: "driver.skip", participantId: driver });
    expect(r.isOk()).toBe(true);
    const timer = timerOf(h);
    expect(timer.session.totalSwitches).toBe(3);
    expect(timer.session.break.since).not.toBeNull();
    expect(timer.clock.running).toBe(false);
  });

  it("Given 周回 1・自動 / When 2 回交代 / Then まだ休憩に入らない", async () => {
    const h = await setupRunning(ROUNDS_1);
    advanceOneSwitch(h);
    advanceOneSwitch(h);
    expect(timerOf(h).session.break.since).toBeNull();
  });

  it("Given 周回 1・知らせるだけ / When 3 回交代 / Then 時計は走ったまま、知らせの印が付く", async () => {
    const h = await setupRunning({ ...ROUNDS_1, mode: "suggest" });
    for (let i = 0; i < 3; i++) advanceOneSwitch(h);
    const timer = timerOf(h);
    expect(timer.clock.running).toBe(true);
    expect(timer.session.break.suggestedAt?.switches).toBe(3);
  });

  it("Given 条件なし / When 何回交代しても / Then 休憩にも知らせにもならない", async () => {
    const h = await setupRunning(NO_BREAK);
    for (let i = 0; i < 9; i++) advanceOneSwitch(h);
    expect(timerOf(h).session.break).toEqual(INITIAL_BREAK_STATE);
  });

  it("Given 休憩中 / When 時間が経つ / Then 自動交代は予約されていない", async () => {
    const h = await setupRunning(ROUNDS_1);
    for (let i = 0; i < 3; i++) advanceOneSwitch(h);
    const before = timerOf(h).session.totalSwitches;
    advanceOneSwitch(h);
    expect(timerOf(h).session.totalSwitches).toBe(before);
  });

  it("Given 完成したルーム / When ロビーへ戻って時間が経つ / Then 自動交代も休憩も起きない（設計 §3.5）", async () => {
    const h = await setupRunning(ROUNDS_1);
    await h.handlers.handleCommand("host-conn", { command: "session.complete" });
    await h.handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });
    const before = timerOf(h);
    for (let i = 0; i < 3; i++) advanceOneSwitch(h);
    const after = timerOf(h);
    expect(after.clock.running).toBe(false);
    expect(after.session.totalSwitches).toBe(before.session.totalSwitches);
    expect(after.session.break.since).toBeNull();
  });

  // 比較（totalSwitches が増えたか）を外すと赤になる形（変異 m294）。
  // 稼働時間は交代などのイベントでしか集約に積まれないので、「交代なしで新たに条件を満たす」のは
  // 名簿から導く適格な席の数が減るとき。周回 1・3 人で 2 回交代したあと、運転者でない Bob が自分を
  // スキップすると適格な席が 2 になり、2 回の交代で条件を満たす（交代は起きていない）。
  it.each([
    ["driver.skip", null],
    ["handoff.note.set", { command: "handoff.note.set", text: "メモ" } as const],
    ["member.move", { command: "member.move", fromIndex: 0, toIndex: 1 } as const],
  ])("Given 周回 1・2 回交代して適格な席が 2 に減り条件を満たす / When 交代を伴わない %s / Then 休憩に入らない（交代の無いコミットでは判定しない）", async (_label, cmd) => {
    const h = await setupRunning(ROUNDS_1);
    advanceOneSwitch(h);
    advanceOneSwitch(h);
    const bob = idOf(h, "bob-conn");
    expect(currentDriverId(h)).not.toBe(bob);

    if (cmd === null) {
      const r = await h.handlers.handleCommand("bob-conn", { command: "driver.skip", participantId: bob });
      expect(r.isOk()).toBe(true);
    } else {
      await h.handlers.handleCommand("bob-conn", { command: "driver.skip", participantId: bob });
      const r = await h.handlers.handleCommand("host-conn", cmd);
      expect(r.isOk()).toBe(true);
    }

    expect(timerOf(h).session.totalSwitches).toBe(2);
    expect(timerOf(h).session.break.since).toBeNull();
    expect(timerOf(h).clock.running).toBe(true);
  });
});

describe("現状維持の交代でも経過時間の判定は走る（PR #416 のレビュー）", () => {
  // 1 人の輪（他が全員不適格も同じ）では交代が現状維持になり、回数は増えないが、時計は再アンカーして
  // 稼働時間を確定する。回数だけを入口にすると、経過時間の条件でも休憩が来なかった。
  it("Given 1 人の輪・経過 30 分・自動 / When 自動交代で 30 分走る / Then 休憩に入る", async () => {
    const h = await setupRunning({ trigger: "elapsed", every: 30, mode: "auto" }, []);
    expect(timerOf(h).session.rotation).toHaveLength(1);
    for (let i = 0; i < 5; i++) advanceOneSwitch(h);
    expect(timerOf(h).session.break.since).toBeNull();
    advanceOneSwitch(h);
    const timer = timerOf(h);
    expect(timer.session.totalSwitches).toBe(0);
    expect(timer.session.break.since).not.toBeNull();
    expect(timer.clock.running).toBe(false);
  });

  it("Given 他の 2 人が一時離脱した 3 人の輪・経過 30 分・知らせるだけ / When 自動交代で 30 分走る / Then 知らせの印が付く", async () => {
    const h = await setupRunning({ trigger: "elapsed", every: 30, mode: "suggest" });
    const driver = currentDriverId(h);
    for (const conn of ["host-conn", "bob-conn", "charlie-conn"]) {
      const pid = idOf(h, conn);
      if (pid !== driver) await h.handlers.handleCommand(conn, { command: "driver.skip", participantId: pid });
    }
    for (let i = 0; i < 6; i++) advanceOneSwitch(h);
    const timer = timerOf(h);
    expect(timer.session.totalSwitches).toBe(0);
    expect(timer.session.break.suggestedAt?.elapsedMs).toBe(30 * 60_000);
    expect(timer.clock.running).toBe(true);
  });
});

describe("現状維持の交代で知らせ直す（PR #416 の再レビュー）", () => {
  it("Given 1 人の輪・経過 30 分・知らせるだけ / When 30 分ごとに 2 回知らせる / Then snapshot の知らせた時点の累計が 30 分→60 分と進む", async () => {
    const h = await setupRunning({ trigger: "elapsed", every: 30, mode: "suggest" }, []);
    const lastBreak = () => h.broadcaster.latestSnapshot()?.session.break;
    for (let i = 0; i < 6; i++) advanceOneSwitch(h);
    expect(lastBreak()).toEqual({ since: null, suggestedAtSwitches: 0, suggestedAtElapsedMs: 30 * 60_000 });
    for (let i = 0; i < 6; i++) advanceOneSwitch(h);
    expect(lastBreak()).toEqual({ since: null, suggestedAtSwitches: 0, suggestedAtElapsedMs: 60 * 60_000 });
    expect(timerOf(h).clock.accumulatedElapsedMs).toBe(60 * 60_000);
  });
});

describe("休憩明けの繰り上げ（#402 設計 §4.2）", () => {
  it("Given 休憩中に運転者が一時離脱した / When 休憩を終える / Then 次の適格な人が運転者になり、時計が走る", async () => {
    const h = await setupRunning(MANUAL_ONLY);
    await h.handlers.handleCommand("host-conn", { command: "break.start" });
    const driver = currentDriverId(h);
    await h.handlers.handleCommand(connOf(h, driver), { command: "driver.skip", participantId: driver });
    await h.handlers.handleCommand("bob-conn", { command: "break.end" });
    const timer = timerOf(h);
    expect(currentDriverId(h)).not.toBe(driver);
    expect(timer.clock.running).toBe(true);
  });
});

describe("休憩の開始・終了を全員に伝える（#402 設計 §4.3）", () => {
  it("Given セッション中 / When Bob が休憩を始めて終える / Then notice が 2 本配られる", async () => {
    const h = await setupRunning(MANUAL_ONLY);
    await h.handlers.handleCommand("bob-conn", { command: "break.start" });
    await h.handlers.handleCommand("bob-conn", { command: "break.end" });
    const actions = h.broadcaster.signals.map((s) => (s.msg as { action?: string }).action).filter(Boolean);
    expect(actions).toEqual(["break-started", "break-ended"]);
  });
});
