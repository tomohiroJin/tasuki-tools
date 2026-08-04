/**
 * セッションライフサイクル・役割・自動交代のテスト（コードレビュー回帰）
 * session.complete の記録/phase 遷移、config.set の Room.config 反映、
 * role.set、スケジューラ配線による自動交代を検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { Scheduler } from "../src/application/schedule.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};

/**
 * Alice(host)・Bob・Charlie の3人が輪に並んだルームを作る。
 *
 * rotation は参加者IDの配列（D6b）なので、`config.members` に名前を並べるだけでは
 * 輪に入らない。実際に参加させ、本人が member.add で輪に加わる（Web の実フローと同じ）。
 */
async function setupRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
) {
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: "Alice",
    config,
  });
  if (!create.isOk()) throw new Error("create failed");
  // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
  const code = store.list().at(-1)!.code;
  for (const [connId, displayName] of [["bob-conn", "Bob"], ["charlie-conn", "Charlie"]] as const) {
    const join = await handlers.handleCommand(connId, {
      command: "room.join", code, displayName, hasAiKey: false,
    });
    if (!join.isOk()) throw new Error(`join failed: ${displayName}`);
    const joinedId = store.get(code)!.participants.find((p) => p.connId === connId)!.participantId;
    const add = await handlers.handleCommand(connId, {
      command: "member.add", participantId: joinedId,
    });
    if (!add.isOk()) throw new Error(`member.add failed: ${displayName}`);
  }
  return code;
}

/**
 * @requirements FR-028
 */
describe("session.complete: 記録と phase 遷移", () => {
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
    // Given
    const code = await setupRoom(handlers, store);
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

    // When
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    clock.advance(120000);
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    // Then
    const after = store.get(code)!;
    expect(after.phase).toBe("celebration");
    expect(after.sessionRecords).toHaveLength(1);
    expect(after.sessionRecords[0]?.problemTitle).toBe("FizzBuzz");
  });

  it("session.complete を二度呼んでも記録は重複しない（冪等）", async () => {
    // Given
    const code = await setupRoom(handlers, store);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    // When
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    // Then
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
    // Given
    const code = await setupRoom(handlers, store);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    // When（進行させてから session フェーズへ、その後リセット）
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "SWITCH" });
    await handlers.handleCommand("host-conn", { command: "session.reset" });

    // Then
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
    // Given
    const code = await setupRoom(handlers, store);
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

    // When
    await handlers.handleCommand("host-conn", { command: "session.reset" });

    // Then
    expect(store.get(code)!.sessionRecords).toHaveLength(1);
  });
});

/**
 * @requirements FR-028
 */
describe("メンバー編集と config.members 同期", () => {
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
    // Given
    const code = await setupRoom(handlers, store);

    // When（代理として Dave を輪に加える。在室者以外は輪に並べられない・D6b）
    await handlers.handleCommand("host-conn", {
      command: "participant.addProxy", displayName: "Dave", participantId: "ignored-client-supplied",
    });

    // Then
    const after = store.get(code)!;
    const dave = after.participants.find((p) => p.displayName === "Dave")!;
    expect(after.session.rotation).toContain(dave.participantId);
    // config.members は rotation の表示名ミラー（D6b）。
    expect(after.config.members).toContain("Dave");
  });

  it("メンバー編集後の完成記録は最新メンバーを反映する", async () => {
    // Given
    const code = await setupRoom(handlers, store);
    const room = store.get(code)!;
    store.put({
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    // When
    await handlers.handleCommand("host-conn", {
      command: "participant.addProxy", displayName: "Dave", participantId: "ignored-client-supplied",
    });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    // Then
    const record = store.get(code)!.sessionRecords[0];
    expect(record?.members).toContain("Dave");
  });
});

/**
 * @requirements FR-009
 */
describe("config.set: Room.config への反映", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock: new FakeClock(1000000), broadcaster, codeGen: new FakeCodeGen() });
  });

  it("language/difficulty を変更すると Room.config が更新される（メンバー名に汚染されない）", async () => {
    // Given
    const code = await setupRoom(handlers, store);

    // When
    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { language: "Python", difficulty: "hard" },
    });

    // Then
    const after = store.get(code)!;
    expect(after.config.language).toBe("Python");
    expect(after.config.difficulty).toBe("hard");
    // メンバーは変更していないので維持
    expect(after.config.members).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("intervalMinutes を変更すると config と clock の両方に反映される", async () => {
    // Given
    const code = await setupRoom(handlers, store);

    // When
    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { intervalMinutes: 10 },
    });

    // Then
    const after = store.get(code)!;
    expect(after.config.intervalMinutes).toBe(10);
    expect(after.clock.intervalSeconds).toBe(600);
  });

  it("problemEnabled=false を変更すると Room.config に反映される（お題なし開始・実機で発覚した退行の回帰）", async () => {
    // Given
    const code = await setupRoom(handlers, store);

    // When
    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { problemEnabled: false },
    });

    // Then
    const after = store.get(code)!;
    expect(after.config.problemEnabled).toBe(false);
  });
});

/**
 * @requirements FR-016
 */
describe("role.set: 役割変更", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let viewerId: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock: new FakeClock(1000000), broadcaster, codeGen: new FakeCodeGen() });
    code = await setupRoom(handlers, store);
    await handlers.handleCommand("viewer-conn", {
      command: "room.join",
      code,
      displayName: "Dave",
      hasAiKey: false,
    });
    viewerId = broadcaster.joinedFor("viewer-conn").participantId;
  });

  it("host が viewer を editor に昇格できる", async () => {
    // Given
    const command = { command: "role.set", participantId: viewerId, role: "editor" } as const;

    // When
    await handlers.handleCommand("host-conn", command);

    // Then
    const after = store.get(code)!;
    const dave = after.participants.find((p) => p.participantId === viewerId);
    expect(dave?.role).toBe("editor");
  });

  it("viewer は role.set を実行できない（UNAUTHORIZED）", async () => {
    // Given
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand("viewer-conn", {
      command: "role.set",
      participantId: viewerId,
      role: "editor",
    });

    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type).toBe("error");
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });
});

/**
 * @requirements FR-003
 */
describe("自動交代: スケジューラ配線", () => {
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
    // Given
    const code = await setupRoom(handlers, store);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    const before = store.get(code)!;
    expect(before.session.currentIndex).toBe(0);

    // When（FakeClock と vitest タイマーを同時に進める。残り 300 秒）
    clock.advance(300000);
    vi.advanceTimersByTime(300000 + 100);

    // Then
    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(1);
    expect(after.session.totalSwitches).toBe(1);
    // switch シグナルが配信される
    expect(broadcaster.signals.some((s) => s.msg.type === "signal")).toBe(true);
  });

  it("PAUSE で自動交代タイマーが解除される", async () => {
    // Given
    const code = await setupRoom(handlers, store);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "PAUSE" });

    // When
    clock.advance(600000);
    vi.advanceTimersByTime(600000 + 100);

    // Then
    const after = store.get(code)!;
    expect(after.session.totalSwitches).toBe(0);
  });

  it("自動交代は ineligible（skip 済み）のメンバーを飛ばして次の eligible へ進む（plan.md L194）", async () => {
    // Given（setupRoom で参加済みの Bob を host が skip して ineligible にする）
    const code = await setupRoom(handlers, store);
    const bob = store.get(code)!.participants.find((p) => p.connId === "bob-conn")!;
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: bob.participantId,
    });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    expect(store.get(code)!.session.currentIndex).toBe(0); // Alice

    // When（交代間隔の経過 → 自動交代は Bob(1) を飛ばして Charlie(2) へ）
    clock.advance(300000);
    vi.advanceTimersByTime(300000 + 100);

    // Then
    expect(store.get(code)!.session.currentIndex).toBe(2);
  });
});

/**
 * @requirements FR-051
 */
describe("ドライバー一時離脱と現ドライバー skip の繰り上げ（plan.md L209）", () => {
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
    // Given
    const code = await setupRoom(handlers, store);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    const host = store.get(code)!.participants.find((p) => p.connId === "host-conn")!;
    expect(store.get(code)!.session.currentIndex).toBe(0); // Alice が現ドライバー

    // When
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: host.participantId,
    });

    // Then
    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(1); // Bob へ繰り上がる
    const skipped = after.participants.find((p) => p.participantId === host.participantId);
    expect(skipped?.driverEligible).toBe(false);
  });

  it("現ドライバー skip でタイマーが次担当向けにリセットされる", async () => {
    // Given（開始から 100 秒経過させてから skip する）
    const code = await setupRoom(handlers, store);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    clock.advance(100000);
    const host = store.get(code)!.participants.find((p) => p.connId === "host-conn")!;

    // When
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: host.participantId,
    });

    // Then（次担当でタイマーが満タンに再アンカーされる）
    const after = store.get(code)!;
    expect(after.clock.anchorServerTime).toBe(clock.now());
    expect(after.clock.secondsLeftAtAnchor).toBe(after.clock.intervalSeconds);
  });

  it("全員 ineligible のときは現ドライバー skip でも現状維持（無限ループしない）", async () => {
    // Given（メンバー1名のルームを作り、現ドライバー＝唯一の eligible にする）
    await handlers.handleCommand("solo-conn", {
      command: "room.create",
      displayName: "Onlyone",
      config: { language: "TypeScript", difficulty: "easy", members: ["Onlyone"], intervalMinutes: 5 },
    });
    const code = broadcaster.createdFor("solo-conn").code;
    await handlers.handleCommand("solo-conn", { command: "session.act", action: "START" });
    const me = store.get(code)!.participants.find((p) => p.connId === "solo-conn")!;

    // When（唯一の eligible を skip する）
    await handlers.handleCommand("solo-conn", {
      command: "driver.skip",
      participantId: me.participantId,
    });

    // Then（交代先が無いので現状維持。currentIndex 据え置き・switch カウント無し）
    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(0);
    expect(after.session.totalSwitches).toBe(0);

    // タイマーを進めても無限ループせず、自動交代は現状維持のまま
    clock.advance(600000);
    vi.advanceTimersByTime(600000 + 100);
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });
});
