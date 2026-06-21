/**
 * セッションライフサイクル・役割・自動交代のテスト（コードレビュー回帰）
 * session.complete の記録/phase 遷移、config.set の Room.config 反映、
 * role.set、スケジューラ配線による自動交代を検証する。
 * 要件: FR-003, FR-009, FR-016, FR-028
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { Scheduler } from "../src/application/schedule.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `LC${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: string[] = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];
  broadcastSnapshot(code: string): void { this.snapshots.push(code); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(roomCode: string, msg: ServerMsg): void { this.signals.push({ roomCode, msg }); }
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};

async function setupRoom(handlers: ReturnType<typeof makeHandlers>) {
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: "Alice",
    config,
  });
  if (!create.isOk()) throw new Error("create failed");
  return create.value.code;
}

describe("session.complete: 記録と phase 遷移（FR-028）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("お題確定後の完成で sessionRecords に記録が追加され phase=celebration になる", async () => {
    const code = await setupRoom(handlers);

    // お題を Room に直接設定（problem.submit 経路の代替）
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: {
        title: "FizzBuzz",
        description: "d",
        requirements: ["r"],
        exampleTest: "t",
        hints: [],
      },
    });

    // セッション開始 → 完成
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    clock.advance(120000);
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    const after = store.get(code)!;
    expect(after.phase).toBe("celebration");
    expect(after.sessionRecords).toHaveLength(1);
    expect(after.sessionRecords[0]?.problemTitle).toBe("FizzBuzz");
  });

  it("session.complete を二度呼んでも記録は重複しない（冪等）", async () => {
    const code = await setupRoom(handlers);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    expect(store.get(code)!.sessionRecords).toHaveLength(1);
  });
});

describe("session.reset: 最初から再スタート（v2.3 #3）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  // v2.3 #3: リセットは「最初から再スタート」になった。session 画面に留まり
  // （phase=session 維持）、お題・メンバー・設定は保持したまま、集約だけ先頭・満タン・
  // 走行に初期化される（旧仕様は phase=setup・お題クリアでロビーに飛ばされ、かつ
  // running=false でリセット後に開始できず詰んでいた）。
  it("reset で phase は session のまま・お題は保持され、ローテーションが初期化され clock は走行で再スタートする", async () => {
    const code = await setupRoom(handlers);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    // 進行させてから session フェーズへ、その後リセット
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "SWITCH" });
    await handlers.handleCommand("host-conn", { command: "session.reset" });

    const after = store.get(code)!;
    // session 画面に留まる（その場で走り直す）
    expect(after.phase).toBe("session");
    // お題は保持される（null クリアされない）
    expect(after.problem).not.toBeNull();
    expect(after.problem?.title).toBe("FizzBuzz");
    // 集約は先頭・満タン・走行で再スタート
    expect(after.clock.running).toBe(true);
    expect(after.session.totalSwitches).toBe(0);
    expect(after.session.currentIndex).toBe(0);
  });

  it("reset しても完成記録の履歴は保持される", async () => {
    const code = await setupRoom(handlers);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
      sessionRecords: [
        {
          id: "rec-1",
          problemTitle: "Old",
          language: "TypeScript",
          difficulty: "easy",
          elapsedSeconds: 60,
          members: ["Alice", "Bob"],
          totalSwitches: 1,
          completedAt: 1000000,
        },
      ],
    });

    await handlers.handleCommand("host-conn", { command: "session.reset" });

    expect(store.get(code)!.sessionRecords).toHaveLength(1);
  });
});

describe("メンバー編集と config.members 同期（FR-028 記録の正確性）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("member.add 後、config.members が rotation に同期する", async () => {
    const code = await setupRoom(handlers);

    await handlers.handleCommand("host-conn", { command: "member.add", name: "Dave" });

    const after = store.get(code)!;
    expect(after.session.rotation).toContain("Dave");
    expect(after.config.members).toEqual(after.session.rotation);
  });

  it("メンバー編集後の完成記録は最新メンバーを反映する", async () => {
    const code = await setupRoom(handlers);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    await handlers.handleCommand("host-conn", { command: "member.add", name: "Dave" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    const record = store.get(code)!.sessionRecords[0];
    expect(record?.members).toContain("Dave");
  });
});

describe("config.set: Room.config への反映（FR-009）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock: new FakeClock(1000000), broadcaster, codeGen: new FakeCodeGen() });
  });

  it("language/difficulty を変更すると Room.config が更新される（メンバー名に汚染されない）", async () => {
    const code = await setupRoom(handlers);

    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { language: "Python", difficulty: "hard" },
    });

    const after = store.get(code)!;
    expect(after.config.language).toBe("Python");
    expect(after.config.difficulty).toBe("hard");
    // メンバーは変更していないので維持
    expect(after.config.members).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("intervalMinutes を変更すると config と clock の両方に反映される", async () => {
    const code = await setupRoom(handlers);

    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { intervalMinutes: 10 },
    });

    const after = store.get(code)!;
    expect(after.config.intervalMinutes).toBe(10);
    expect(after.clock.intervalSeconds).toBe(600);
  });

  it("problemEnabled=false を変更すると Room.config に反映される（お題なし開始・実機で発覚した退行の回帰）", async () => {
    const code = await setupRoom(handlers);

    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { problemEnabled: false },
    });

    const after = store.get(code)!;
    expect(after.config.problemEnabled).toBe(false);
  });
});

describe("role.set: 役割変更（FR-016）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let viewerId: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock: new FakeClock(1000000), broadcaster, codeGen: new FakeCodeGen() });
    code = await setupRoom(handlers);
    const join = await handlers.handleCommand("viewer-conn", {
      command: "room.join",
      code,
      displayName: "Dave",
      hasAiKey: false,
    });
    if (join.isOk()) viewerId = join.value.participantId;
  });

  it("host が viewer を editor に昇格できる", async () => {
    await handlers.handleCommand("host-conn", {
      command: "role.set",
      participantId: viewerId,
      role: "editor",
    });

    const after = store.get(code)!;
    const dave = after.participants.find((p) => p.participantId === viewerId);
    expect(dave?.role).toBe("editor");
  });

  it("viewer は role.set を実行できない（UNAUTHORIZED）", async () => {
    broadcaster.sent.length = 0;
    await handlers.handleCommand("viewer-conn", {
      command: "role.set",
      participantId: viewerId,
      role: "editor",
    });
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type).toBe("error");
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("自動交代: スケジューラ配線（FR-003）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let scheduler: Scheduler;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    scheduler = new Scheduler(clock);
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen(), scheduler });
  });

  afterEach(() => {
    scheduler.clearAll();
    vi.useRealTimers();
  });

  it("START 後、交代間隔の経過で自動的にドライバーが進む", async () => {
    const code = await setupRoom(handlers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });

    const before = store.get(code)!;
    expect(before.session.currentIndex).toBe(0);

    // FakeClock と vitest タイマーを同時に進める（残り 300 秒）
    clock.advance(300000);
    vi.advanceTimersByTime(300000 + 100);

    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(1);
    expect(after.session.totalSwitches).toBe(1);
    // switch シグナルが配信される
    expect(broadcaster.signals.some((s) => s.msg.type === "signal")).toBe(true);
  });

  it("PAUSE で自動交代タイマーが解除される", async () => {
    const code = await setupRoom(handlers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "PAUSE" });

    clock.advance(600000);
    vi.advanceTimersByTime(600000 + 100);

    const after = store.get(code)!;
    expect(after.session.totalSwitches).toBe(0);
  });

  it("自動交代は ineligible（skip 済み）のメンバーを飛ばして次の eligible へ進む（plan.md L194）", async () => {
    const code = await setupRoom(handlers);
    // Bob を参加者として join させ、host が Bob を skip して ineligible にする
    await handlers.handleCommand("bob-conn", {
      command: "room.join",
      code,
      displayName: "Bob",
      hasAiKey: false,
    });
    const bob = store.get(code)!.participants.find((p) => p.connId === "bob-conn")!;
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: bob.participantId,
    });

    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    expect(store.get(code)!.session.currentIndex).toBe(0); // Alice

    // 交代間隔の経過 → 自動交代は Bob(1) を飛ばして Charlie(2) へ
    clock.advance(300000);
    vi.advanceTimersByTime(300000 + 100);

    expect(store.get(code)!.session.currentIndex).toBe(2);
  });
});

describe("ドライバー一時離脱と現ドライバー skip の繰り上げ（FR-051, plan.md L209）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let scheduler: Scheduler;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    scheduler = new Scheduler(clock);
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen(), scheduler });
  });

  afterEach(() => {
    scheduler.clearAll();
    vi.useRealTimers();
  });

  it("稼働中に現ドライバーを driver.skip すると次の eligible へ繰り上がる", async () => {
    const code = await setupRoom(handlers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    const host = store.get(code)!.participants.find((p) => p.connId === "host-conn")!;
    expect(store.get(code)!.session.currentIndex).toBe(0); // Alice が現ドライバー

    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: host.participantId,
    });

    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(1); // Bob へ繰り上がる
    const skipped = after.participants.find((p) => p.participantId === host.participantId);
    expect(skipped?.driverEligible).toBe(false);
  });

  it("現ドライバー skip でタイマーが次担当向けにリセットされる", async () => {
    const code = await setupRoom(handlers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    // 開始から 100 秒経過させてから skip する
    clock.advance(100000);
    const host = store.get(code)!.participants.find((p) => p.connId === "host-conn")!;

    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: host.participantId,
    });

    const after = store.get(code)!;
    // 次担当でタイマーが満タンに再アンカーされる
    expect(after.clock.anchorServerTime).toBe(clock.now());
    expect(after.clock.secondsLeftAtAnchor).toBe(after.clock.intervalSeconds);
  });

  it("全員 ineligible のときは現ドライバー skip でも現状維持（無限ループしない）", async () => {
    // メンバー1名のルームを作り、現ドライバー（唯一の eligible）を skip する
    const create = await handlers.handleCommand("solo-conn", {
      command: "room.create",
      displayName: "Onlyone",
      config: { language: "TypeScript", difficulty: "easy", members: ["Onlyone"], intervalMinutes: 5 },
    });
    const code = create.isOk() ? create.value.code : "";
    await handlers.handleCommand("solo-conn", { command: "session.act", action: "START" });
    const me = store.get(code)!.participants.find((p) => p.connId === "solo-conn")!;

    await handlers.handleCommand("solo-conn", {
      command: "driver.skip",
      participantId: me.participantId,
    });

    const after = store.get(code)!;
    // 交代先が無いので現状維持（currentIndex 据え置き・switch カウント無し）
    expect(after.session.currentIndex).toBe(0);
    expect(after.session.totalSwitches).toBe(0);

    // タイマーを進めても無限ループせず、自動交代は現状維持のまま
    clock.advance(600000);
    vi.advanceTimersByTime(600000 + 100);
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });
});
