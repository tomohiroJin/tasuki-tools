/**
 * セッションライフサイクル・自動交代のテスト（コードレビュー回帰）
 * session.complete の記録/phase 遷移、config.set の Room.config 反映、
 * スケジューラ配線による自動交代を検証する。
 * （role.set の検証は #95 S3 でコマンドごと廃止されたため無くなった。）
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { Scheduler } from "../src/application/schedule.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { roomViewOf, putRoomView, participantIdOfConn } from "./support/room-view.js";
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
  timers: InMemoryTimerStore,
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
    const joinedId = roomViewOf(store, timers, code).participants.find((p) => p.participantId === participantIdOfConn(store, connId))!.participantId;
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
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("お題確定後の完成で sessionRecords に記録が追加され phase=celebration になる", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    const room = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
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
    const after = roomViewOf(store, timers, code);
    expect(after.phase).toBe("celebration");
    expect(after.sessionRecords).toHaveLength(1);
    expect(after.sessionRecords[0]?.problemTitle).toBe("FizzBuzz");
  });

  it("session.complete を二度呼んでも記録は重複しない（冪等）", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    const room = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    // When
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    // Then
    expect(roomViewOf(store, timers, code).sessionRecords).toHaveLength(1);
  });
});

describe("session.reset: 最初から再スタート（v2.3 #3）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  // v2.3 #3: リセットは「最初から再スタート」になった。session 画面に留まり
  // （phase=session 維持）、お題・メンバー・設定は保持したまま、集約だけ先頭・満タン・
  // 走行に初期化される（旧仕様は phase=setup・お題クリアでロビーに飛ばされ、かつ
  // running=false でリセット後に開始できず詰んでいた）。
  it("reset で phase は session のまま・お題は保持され、ローテーションが初期化され clock は走行で再スタートする", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    const room = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
      ...room,
      problem: { title: "FizzBuzz", description: "d", requirements: ["r"], exampleTest: "t", hints: [] },
    });

    // When（進行させてから session フェーズへ、その後リセット）
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "SWITCH" });
    await handlers.handleCommand("host-conn", { command: "session.reset" });

    // Then
    const after = roomViewOf(store, timers, code);
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
    const code = await setupRoom(handlers, store, timers);
    const room = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
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
    expect(roomViewOf(store, timers, code).sessionRecords).toHaveLength(1);
  });
});

/**
 * ロビーへ戻ったルームは前のセッションのお題を持たない（#273）。
 *
 * #249（#95 S5c）で「新しいセッション」が**ルームをロビーへ戻してから玄関へ送る**形に
 * なった（`apps/timer-web/src/sync/use-timer-sync.ts` の `newSession`。送るのは
 * `phase.set setup` の 1 通だけ）。それまでは同じルームで 2 本目を始めること自体が
 * 無かったので、`PhaseSet` がお題を残しても誰も困らなかった。
 *
 * **お題を埋める側は既に不変条件で書かれている**（`application/lobby-problem.ts` は
 * commit のたびに「ロビーで `problem` が無いなら用意する」を見る・#271）。
 * 足りないのは**捨てる側**だけである。ここは delegator を配線せずに、
 * 「落ちたこと」そのものを見る（埋め直しは `lobby-problem-autorequest.test.ts` が
 * 実 WS で見る）。
 */
describe("phase.set: ロビーへ戻るとお題は持ち越さない（#273）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  const problem = {
    title: "FizzBuzz",
    description: "d",
    requirements: ["r"],
    exampleTest: "t",
    hints: [],
  };

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("Given 完了したセッション / When ロビーへ戻す / Then 1 本目のお題は残らない", async () => {
    // Given: お題を確定させ、走らせて完成させる（phase=celebration）
    const code = await setupRoom(handlers, store, timers);
    putRoomView(store, timers, { ...roomViewOf(store, timers, code), problem });
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    clock.advance(120000);
    await handlers.handleCommand("host-conn", { command: "session.complete" });
    if (roomViewOf(store, timers, code).phase !== "celebration") {
      throw new Error("前提が崩れた: 完成していない");
    }

    // When: 「新しいセッション」が送る 1 通
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });

    // Then: 2 本目のロビーに 1 本目のお題は出ていない
    const after = roomViewOf(store, timers, code);
    expect(after.phase).toBe("setup");
    expect(after.problem).toBeNull();
  });

  it("Given 完成記録 / When ロビーへ戻す / Then 記録は残る（お題だけを落とす）", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    putRoomView(store, timers, { ...roomViewOf(store, timers, code), problem });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.complete" });

    // When
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });

    // Then: 完成記録は Summary / 履歴の元なので畳まない
    expect(roomViewOf(store, timers, code).sessionRecords).toHaveLength(1);
  });

  /**
   * 落とす条件は**完了画面から出る遷移**に限る（#273 のレビュー②）。
   *
   * `decide.ts` の `phase.set` は**現在の phase を一切見ずに** `PhaseSet` を返す
   * （ガードが無い）。一方 `packages/sync-client/src/connection.ts` は未確立時の
   * コマンドを溜め、**再接続の `onopen` でそのまま流す**。したがって
   * 「切断中に押された『新しいセッション』が、再接続後に**走行中の**ルームへ届く」
   * 経路は実在する。
   *
   * 「ロビー以外 → ロビー」で落とすと、この 1 通で**走っているセッションのお題が
   * 消えて別のお題に差し替わる**。完了画面から出る遷移だけを見れば起きない。
   */
  it("Given 走行中のセッション / When 遅れて届いた phase.set setup が流れる / Then 走っているお題を消さない", async () => {
    // Given: お題を確定させてセッションを走らせる
    const code = await setupRoom(handlers, store, timers);
    putRoomView(store, timers, { ...roomViewOf(store, timers, code), problem });
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    if (roomViewOf(store, timers, code).phase !== "session") {
      throw new Error("前提が崩れた: セッションが始まっていない");
    }

    // When: 切断中に押された「新しいセッション」が、再接続で溜まっていた分として届く
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });

    // Then: 完了していないので、走っていたお題はそのまま残る
    expect(roomViewOf(store, timers, code).problem?.title).toBe("FizzBuzz");
  });

  it("Given 既にロビーに居るルーム / When もう一度ロビーへ戻す / Then 用意済みのお題を捨てない", async () => {
    // Given: ロビーでお題が用意された状態（`fillLobbyProblem` が埋めた直後と同じ）
    const code = await setupRoom(handlers, store, timers);
    putRoomView(store, timers, { ...roomViewOf(store, timers, code), problem });

    // When: 完了画面に居た 2 人目が、遅れて「新しいセッション」を押す
    //       （押した瞬間の画面は celebration でも、届く頃にはもう setup である）
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });

    // Then: 用意済みのお題がそのまま残る（捨てると全員の画面で作り直しが走る）
    expect(roomViewOf(store, timers, code).problem?.title).toBe("FizzBuzz");
  });
});

/**
 * @requirements FR-028
 */
describe("メンバー編集と config.members 同期", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("member.add 後、config.members が rotation に同期する", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);

    // When（代理として Dave を輪に加える。在室者以外は輪に並べられない・D6b）
    await handlers.handleCommand("host-conn", {
      command: "participant.addProxy", displayName: "Dave", participantId: "ignored-client-supplied",
    });

    // Then
    const after = roomViewOf(store, timers, code);
    const dave = after.participants.find((p) => p.displayName === "Dave")!;
    expect(after.session.rotation).toContain(dave.participantId);
    // config.members は rotation の表示名ミラー（D6b）。
    expect(after.config.members).toContain("Dave");
  });

  it("メンバー編集後の完成記録は最新メンバーを反映する", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    const room = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
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
    const record = roomViewOf(store, timers, code).sessionRecords[0];
    expect(record?.members).toContain("Dave");
  });
});

/**
 * @requirements FR-009
 */
describe("config.set: Room.config への反映", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock: new FakeClock(1000000), broadcaster, codeGen: new FakeCodeGen() });
  });

  it("language/difficulty を変更すると Room.config が更新される（メンバー名に汚染されない）", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);

    // When
    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { language: "Python", difficulty: "hard" },
    });

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.config.language).toBe("Python");
    expect(after.config.difficulty).toBe("hard");
    // メンバーは変更していないので維持
    expect(after.config.members).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("intervalMinutes を変更すると config と clock の両方に反映される", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);

    // When
    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { intervalMinutes: 10 },
    });

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.config.intervalMinutes).toBe(10);
    expect(after.clock.intervalSeconds).toBe(600);
  });

  it("problemEnabled=false を変更すると Room.config に反映される（お題なし開始・実機で発覚した退行の回帰）", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);

    // When
    await handlers.handleCommand("host-conn", {
      command: "config.set",
      config: { problemEnabled: false },
    });

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.config.problemEnabled).toBe(false);
  });
});

/**
 * @requirements FR-003
 */
describe("自動交代: スケジューラ配線", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let scheduler: Scheduler;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    scheduler = new Scheduler(clock);
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen(), scheduler });
  });

  afterEach(() => {
    scheduler.clearAll();
    jest.useRealTimers();
  });

  it("START 後、交代間隔の経過で自動的にドライバーが進む", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    const before = roomViewOf(store, timers, code);
    expect(before.session.currentIndex).toBe(0);

    // When（FakeClock と vitest タイマーを同時に進める。残り 300 秒）
    clock.advance(300000);
    jest.advanceTimersByTime(300000 + 100);

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.session.currentIndex).toBe(1);
    expect(after.session.totalSwitches).toBe(1);
    // switch シグナルが配信される
    expect(broadcaster.signals.some((s) => s.msg.type === "signal")).toBe(true);
  });

  it("PAUSE で自動交代タイマーが解除される", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "PAUSE" });

    // When
    clock.advance(600000);
    jest.advanceTimersByTime(600000 + 100);

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.session.totalSwitches).toBe(0);
  });

  it("自動交代は ineligible（skip 済み）のメンバーを飛ばして次の eligible へ進む（plan.md L194）", async () => {
    // Given（setupRoom で参加済みの Bob を host が skip して ineligible にする）
    const code = await setupRoom(handlers, store, timers);
    const bob = roomViewOf(store, timers, code).participants.find((p) => p.participantId === participantIdOfConn(store, "bob-conn"))!;
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: bob.participantId,
    });
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(0); // Alice

    // When（交代間隔の経過 → 自動交代は Bob(1) を飛ばして Charlie(2) へ）
    clock.advance(300000);
    jest.advanceTimersByTime(300000 + 100);

    // Then
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(2);
  });
});

/**
 * @requirements FR-051
 */
describe("ドライバー一時離脱と現ドライバー skip の繰り上げ（plan.md L209）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let scheduler: Scheduler;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    scheduler = new Scheduler(clock);
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen(), scheduler });
  });

  afterEach(() => {
    scheduler.clearAll();
    jest.useRealTimers();
  });

  it("稼働中に現ドライバーを driver.skip すると次の eligible へ繰り上がる", async () => {
    // Given
    const code = await setupRoom(handlers, store, timers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    const host = roomViewOf(store, timers, code).participants.find((p) => p.participantId === participantIdOfConn(store, "host-conn"))!;
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(0); // Alice が現ドライバー

    // When
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: host.participantId,
    });

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.session.currentIndex).toBe(1); // Bob へ繰り上がる
    const skipped = after.participants.find((p) => p.participantId === host.participantId);
    expect(skipped?.driverEligible).toBe(false);
  });

  it("現ドライバー skip でタイマーが次担当向けにリセットされる", async () => {
    // Given（開始から 100 秒経過させてから skip する）
    const code = await setupRoom(handlers, store, timers);
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });
    clock.advance(100000);
    const host = roomViewOf(store, timers, code).participants.find((p) => p.participantId === participantIdOfConn(store, "host-conn"))!;

    // When
    await handlers.handleCommand("host-conn", {
      command: "driver.skip",
      participantId: host.participantId,
    });

    // Then（次担当でタイマーが満タンに再アンカーされる）
    const after = roomViewOf(store, timers, code);
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
    const me = roomViewOf(store, timers, code).participants.find((p) => p.participantId === participantIdOfConn(store, "solo-conn"))!;

    // When（唯一の eligible を skip する）
    await handlers.handleCommand("solo-conn", {
      command: "driver.skip",
      participantId: me.participantId,
    });

    // Then（交代先が無いので現状維持。currentIndex 据え置き・switch カウント無し）
    const after = roomViewOf(store, timers, code);
    expect(after.session.currentIndex).toBe(0);
    expect(after.session.totalSwitches).toBe(0);

    // タイマーを進めても無限ループせず、自動交代は現状維持のまま
    clock.advance(600000);
    jest.advanceTimersByTime(600000 + 100);
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(0);
  });
});
