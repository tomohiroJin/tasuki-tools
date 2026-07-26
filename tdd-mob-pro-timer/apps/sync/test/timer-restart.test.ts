/**
 * session.act RESTART（Issue #14 持ち時間のやり直し）のサーバ挙動。
 * editor+ で実行でき、現ドライバー・回数・お題・メモ・設定を保ったまま満タンで
 * 再スケジュールされること。viewer は拒否されること。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Scheduler } from "../src/application/schedule.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig, Room, Problem } from "@tdd-mob/core";
import { secondsLeft } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `LC${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}
class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  broadcastSnapshot(): void {}
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}
/** schedule 呼び出しを記録するだけのスケジューラ（実タイマーを張らない）。 */
class SpyScheduler {
  readonly scheduled: Array<{ code: string; secondsLeft: number }> = [];
  readonly cleared: string[] = [];
  schedule(code: string, left: number): void { this.scheduled.push({ code, secondsLeft: left }); }
  clear(code: string): void { this.cleared.push(code); }
  clearAll(): void {}
}

const INTERVAL_MINUTES = 5;
const INTERVAL_SECONDS = INTERVAL_MINUTES * 60;
const START = 1_000_000;

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A"],
  intervalMinutes: INTERVAL_MINUTES,
};

const problem: Problem = {
  title: "FizzBuzz",
  description: "説明",
  requirements: ["要件1"],
  exampleTest: "test",
  hints: [],
};

/**
 * host A・editor B・viewer C の 3 人が居るルームを作り、rotation [A,B,C] の
 * currentIndex=1（B が現ドライバー）で 100 秒消費した稼働状態にして store に置く。
 */
async function setupRunningRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  clockNow: number,
  sessionOverrides: Partial<Room["session"]> = {},
  clockOverrides: Partial<Room["clock"]> = {},
): Promise<string> {
  const create = await handlers.handleCommand("conn-a", {
    command: "room.create", displayName: "A", config,
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;
  const room = store.get(code)!;
  const host = room.participants[0]!;
  const mk = (id: string, name: string, conn: string, role: Room["participants"][number]["role"]) =>
    ({ ...host, participantId: id, connId: conn, displayName: name, role, presence: "online" as const });
  store.put({
    ...room,
    phase: "session",
    problem,
    handoffNote: "引き継ぎメモ",
    participants: [host, mk("pid-b", "B", "conn-b", "editor"), mk("pid-c", "C", "conn-c", "viewer")],
    config: { ...room.config, members: ["A", "B", "C"] },
    session: {
      ...room.session,
      rotation: ["A", "B", "C"],
      driverCounts: [1, 0, 0],
      currentIndex: 1,
      totalSwitches: 1,
      ...sessionOverrides,
    },
    clock: {
      ...room.clock,
      running: true,
      // 100 秒消費済み（残り 200 秒）にする。
      anchorServerTime: clockNow - 100_000,
      secondsLeftAtAnchor: INTERVAL_SECONDS,
      runningSince: clockNow - 100_000,
      accumulatedElapsedMs: 500_000,
      ...clockOverrides,
    },
  });
  return code;
}

describe("session.act RESTART（Issue #14 持ち時間のやり直し）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let scheduler: SpyScheduler;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(START);
    scheduler = new SpyScheduler();
    handlers = makeHandlers({
      store,
      clock,
      broadcaster: new SpyBroadcaster(),
      codeGen: new FakeCodeGen(),
      scheduler: scheduler as unknown as Scheduler,
    });
  });

  it("現ドライバー（editor 本人）が実行するとタイマーが満タンから走り直す", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    expect(secondsLeft(store.get(code)!.clock, START)).toBeCloseTo(200, 0);

    const result = await handlers.handleCommand("conn-b", { command: "session.act", action: "RESTART" });
    expect(result.isOk()).toBe(true);

    const room = store.get(code)!;
    expect(room.clock.running).toBe(true);
    expect(secondsLeft(room.clock, START)).toBeCloseTo(INTERVAL_SECONDS, 0);
  });

  it("ドライバー・担当回数・交代回数が変わらない", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    await handlers.handleCommand("conn-b", { command: "session.act", action: "RESTART" });

    const room = store.get(code)!;
    expect(room.session.currentIndex).toBe(1); // B のまま
    expect(room.session.driverCounts).toEqual([1, 0, 0]);
    expect(room.session.totalSwitches).toBe(1);
    expect(room.session.rotation).toEqual(["A", "B", "C"]);
  });

  it("お題・共有メモ・メンバー・設定・参加者が維持される", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    await handlers.handleCommand("conn-b", { command: "session.act", action: "RESTART" });

    const room = store.get(code)!;
    expect(room.problem?.title).toBe("FizzBuzz");
    expect(room.handoffNote).toBe("引き継ぎメモ");
    expect(room.config.members).toEqual(["A", "B", "C"]);
    expect(room.config.intervalMinutes).toBe(INTERVAL_MINUTES);
    expect(room.participants.map((p) => p.participantId)).toEqual([
      room.participants[0]!.participantId, "pid-b", "pid-c",
    ]);
    expect(room.phase).toBe("session");
  });

  it("一時停止中に実行すると走行再開する（isPaused 解除）", async () => {
    const code = await setupRunningRoom(
      handlers, store, START,
      { isPaused: true },
      { running: false, secondsLeftAtAnchor: 200, runningSince: null, anchorServerTime: START - 100_000 },
    );

    await handlers.handleCommand("conn-b", { command: "session.act", action: "RESTART" });

    const room = store.get(code)!;
    expect(room.session.isPaused).toBe(false);
    expect(room.clock.running).toBe(true);
    expect(secondsLeft(room.clock, START)).toBeCloseTo(INTERVAL_SECONDS, 0);
  });

  it("満タン基準で自動交代が再スケジュールされる", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    scheduler.scheduled.length = 0;

    await handlers.handleCommand("conn-b", { command: "session.act", action: "RESTART" });

    const last = scheduler.scheduled.at(-1);
    expect(last?.code).toBe(code);
    expect(last?.secondsLeft).toBeCloseTo(INTERVAL_SECONDS, 0);
  });

  it("viewer の実行は UNAUTHORIZED で拒否され状態が変わらない", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    const before = store.get(code)!.clock;

    const result = await handlers.handleCommand("conn-c", { command: "session.act", action: "RESTART" });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("UNAUTHORIZED");
    expect(store.get(code)!.clock).toEqual(before);
  });

  it("host も実行できる（editor+ のため）", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    const result = await handlers.handleCommand("conn-a", { command: "session.act", action: "RESTART" });
    expect(result.isOk()).toBe(true);
    expect(secondsLeft(store.get(code)!.clock, START)).toBeCloseTo(INTERVAL_SECONDS, 0);
  });

  it("セッション経過時間は巻き戻らない（走った分は積算される）", async () => {
    const code = await setupRunningRoom(handlers, store, START);
    await handlers.handleCommand("conn-b", { command: "session.act", action: "RESTART" });
    // 開始前 500_000ms + 稼働していた 100_000ms を確定加算する。
    expect(store.get(code)!.clock.accumulatedElapsedMs).toBe(600_000);
  });
});
