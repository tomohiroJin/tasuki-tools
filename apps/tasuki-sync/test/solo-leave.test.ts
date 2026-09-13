/**
 * ソロのルームからの退出（Issue #79）。
 *
 * ルームを作った本人が、誰も参加しないうちに気が変わって抜けようとすると
 * `BelowMinMembers`（「最後のドライバーは外れられません。」）で拒否されていた。
 * 抜ける手段が無いのでタブを閉じるしかなく、閉じてもルームはアイドル回収（既定 30 分）
 * まで残り続ける。本人にとっては「作ってしまった部屋を片付けられない」状態だった。
 *
 * 拒否の理由は「rotation を空にすると evolve が破綻する」ことであり、これは
 * **部屋に人が残る前提**の保護である。誰も残らないなら rotation を維持する意味は無い。
 * そこで「退出後に在室者が 0 人になる場合に限り」rotation の evolve を通さず
 * ルームごと破棄する。1 人でも残るなら従来どおり拒否する（挙動が変わるのはソロだけ）。
 *
 * @requirements Issue #79
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { createRoomDestroyer } from "../src/application/destroy-room.js";
import { RoomReclaimer } from "../src/application/room-reclaimer.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { InMemoryRoundStore } from "../src/adapters/poker-in-memory-round-store.js";
import { createTokenStore } from "../src/application/token-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyDestroyer } from "./support/spy-destroyer.js";
import { testRateLimiter, TEST_MAX_ROOMS } from "./support/room-builder.js";
import { testToolGate } from "./support/tool-gate.js";
import { roomViewOf, putRoomView } from "./support/room-view.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { spyHub } from "./support/hub.js";

const soloConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice"],
  intervalMinutes: 5,
};

describe("ソロの部屋からの退出（Issue #79）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const HOST = "solo-host";
  const BOB = "solo-bob";

  const pidOf = (name: string): string =>
    roomViewOf(store, timers, code).participants.find((p) => p.displayName === name)!.participantId;

  /** 直近に connId 宛へ送られた error を返す。 */
  const lastError = (connId: string): { code: string; message: string } | undefined => {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  };

  /** Alice ひとりの部屋（rotation=[Alice]）を作る。room.create 直後の状態そのもの。 */
  beforeEach(async () => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    // 破棄経路は本番（create-sync-server.ts）と同じ形で組む。handlers が destroyRoom を
    // 要り、destroyRoom が handlers.releaseRoom を要る相互依存を、後から代入する
    // クロージャで解く。既定値に頼らないのは、頼ると本番の配線漏れを取り逃がすため
    // （HandlerDeps.destroyRoom の docstring 参照）。
    let destroyRoom: (roomCode: string) => void;
    handlers = makeHandlers({
      store, timers, clock: new FakeClock(1_000_000), broadcaster, hub: spyHub(), codeGen: new FakeCodeGen(),
      tokens: createTokenStore(),
      toolGate: testToolGate({ timers }),
      rateLimiter: testRateLimiter(),
      maxRooms: TEST_MAX_ROOMS,
      destroyRoom: (roomCode) => destroyRoom(roomCode),
    });
    destroyRoom = createRoomDestroyer({
      store,
      timers,
      rounds: new InMemoryRoundStore(),
      releaseRoom: handlers.releaseRoom,
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config: soloConfig,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(HOST).code;
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
    broadcaster.signals.length = 0;
  });

  it("前提: 作成直後は在室者も rotation も本人ひとりである", () => {
    // Given（beforeEach で room.create 済み）
    // When: room.create しただけの状態を取り出す
    const room = roomViewOf(store, timers, code);

    // Then: この 1 人が rotation の最後の 1 人でもあるため、従来は退出が拒否されていた
    expect(room.participants).toHaveLength(1);
    expect(room.session.rotation).toEqual([pidOf("Alice")]);
  });

  it("1 人だけの参加者は自己退出でき、ルームごと破棄される", async () => {
    // Given
    const aliceId = pidOf("Alice");

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then: 受理され、ルームはストアから消えている（アイドル回収を待たない）
    result._unsafeUnwrap();
    expect(store.get(code)).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("退出した本人へ LEFT_ROOM が届く（自分の操作として区別した通知）", async () => {
    // Given
    const aliceId = pidOf("Alice");

    // When
    await handlers.handleCommand(HOST, { command: "participant.remove", participantId: aliceId });

    // Then: 本人が取り残されないよう、破棄しても通知だけは届く
    expect(lastError(HOST)?.code).toBe("LEFT_ROOM");
    expect(broadcaster.hasErrorCode(HOST, "BelowMinMembers")).toBe(false);
  });

  it("破棄したルームへは snapshot も signal も配信しない（宛先が居ない）", async () => {
    // Given
    const aliceId = pidOf("Alice");

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then（拒否されたから配信が無い、では意味が無いので受理も併せて固定する）
    result._unsafeUnwrap();
    expect(broadcaster.snapshots).toEqual([]);
    expect(broadcaster.signals).toEqual([]);
  });

  it("破棄後は同じコードで参加できない（部屋が本当に消えている）", async () => {
    // Given
    await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: pidOf("Alice"),
    });
    broadcaster.sent.length = 0;

    // When: 退出直前まで開いていた招待リンクから入り直そうとする
    const result = await handlers.handleCommand(BOB, {
      command: "room.join", code, displayName: "Bob", hasAiKey: false,
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(lastError(BOB)?.code).toBe("ROOM_NOT_FOUND");
  });

  it("破棄は共通の後始末（destroy-room）へ委ね、タイマー・委譲・トークンを取りこぼさない", async () => {
    // Given: 後始末の呼び出しを記録する破棄経路を注入した handlers
    const spyStore = new InMemoryRoomStore();
    const spyTimers = new InMemoryTimerStore();
    const spyBroadcaster = new SpyBroadcaster();
    const { destroy, calls } = spyDestroyer(spyStore, spyTimers);
    const spyHandlers = makeHandlers({
      store: spyStore,
      timers: spyTimers,
      clock: new FakeClock(1_000_000),
      broadcaster: spyBroadcaster,
      hub: spyHub(),
      codeGen: new FakeCodeGen(),
      tokens: createTokenStore(),
      toolGate: testToolGate({ timers: spyTimers }),
      rateLimiter: testRateLimiter(),
      maxRooms: TEST_MAX_ROOMS,
      destroyRoom: destroy,
    });
    const created = await spyHandlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config: soloConfig,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    const soloCode = spyBroadcaster.createdFor(HOST).code;
    const aliceId = spyStore.get(soloCode)!.participants[0]!.id;

    // When
    const result = await spyHandlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then: server.ts のアイドル回収とまったく同じ後始末を、同じ順序で通る
    // （並びの正本は `src/application/destroy-room.ts`。**件数はここに書かない**）
    result._unsafeUnwrap();
    expect(calls).toEqual([
      `scheduler.clear:${soloCode}`,
      `delegator.cancel:${soloCode}`,
      `presence.clearRoomTimers:${soloCode}`,
      `releaseRoom:${soloCode}`,
    ]);
    expect(spyStore.get(soloCode)).toBeUndefined();
  });
});

// ─── 挙動が変わるのはソロのケースだけ ────────────────────────────────────────
//
// 緩めたのは「退出後に在室者が 0 人になる」場合だけである。1 人でも残るなら
// rotation が空の部屋に人が取り残される破綻を作るため、従来どおり拒否し続ける。
//
// **#95 S4a で「在室者」の数え方だけが変わった**（名簿の人だけを数え、輪の代理は数えない）。
// 緩める条件そのものは動かしていない。

/**
 * @requirements Issue #79
 */
describe("ソロ以外は挙動が変わらない（Issue #79）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const HOST = "keep-host";
  const BOB = "keep-bob";

  const pidOf = (name: string): string =>
    roomViewOf(store, timers, code).participants.find((p) => p.displayName === name)!.participantId;

  const lastError = (connId: string): { code: string; message: string } | undefined => {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  };

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    // 破棄経路は本番（create-sync-server.ts）と同じ形で組む。handlers が destroyRoom を
    // 要り、destroyRoom が handlers.releaseRoom を要る相互依存を、後から代入する
    // クロージャで解く。既定値に頼らないのは、頼ると本番の配線漏れを取り逃がすため
    // （HandlerDeps.destroyRoom の docstring 参照）。
    let destroyRoom: (roomCode: string) => void;
    handlers = makeHandlers({
      store, timers, clock: new FakeClock(1_000_000), broadcaster, hub: spyHub(), codeGen: new FakeCodeGen(),
      tokens: createTokenStore(),
      toolGate: testToolGate({ timers }),
      rateLimiter: testRateLimiter(),
      maxRooms: TEST_MAX_ROOMS,
      destroyRoom: (roomCode) => destroyRoom(roomCode),
    });
    destroyRoom = createRoomDestroyer({
      store,
      timers,
      rounds: new InMemoryRoundStore(),
      releaseRoom: handlers.releaseRoom,
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config: soloConfig,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(HOST).code;
  });

  it("実在の在室者が 1 人残るなら、rotation 最後の 1 人の退出は従来どおり拒否される", async () => {
    // Given: Alice を輪から外し rotation=[Bob]・在室は Alice と Bob の 2 名にする
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(BOB, { command: "member.add", participantId: pidOf("Bob") });
    await handlers.handleCommand(HOST, { command: "member.remove", index: 0 });
    expect(roomViewOf(store, timers, code).session.rotation).toEqual([pidOf("Bob")]);
    broadcaster.sent.length = 0;

    // When: rotation 上の最後の 1 人である Bob が自己退出しようとする
    const result = await handlers.handleCommand(BOB, {
      command: "participant.remove", participantId: pidOf("Bob"),
    });

    // Then: 拒否され、ルームも Bob も残る（在室者 0 人にならないため破棄しない）
    expect(result.isErr()).toBe(true);
    expect(lastError(BOB)?.code).toBe("BelowMinMembers");
    expect(store.get(code)).toBeDefined();
    expect(roomViewOf(store, timers, code).participants).toHaveLength(2);
  });

  // 主張が 2 度ひっくり返っている節である。
  //
  //   - #95 S3 以前: 「進行できる人が残らない」不変条件（LAST_MANAGER_LEAVE）で**拒否**
  //   - #95 S3: 役割ごと不変条件が消えたので Alice は抜けられる。ただし
  //     **代理を在室者に数えていた**ので、代理だけが残る部屋ができて**破棄しなかった**
  //   - #95 S4a（ここ）: 代理は `RotationEntry` になり名簿から出た。在室者は名簿の人だけを
  //     数えるので、名簿が空になった時点で**破棄する**
  //
  // 「代理だけが残る部屋」は S3 が残した宿題そのものだった —— 名簿には誰も居ないのに
  // 部屋には「人」が居ることになり、説明のつかない状態が TTL まで残っていた。
  // 作れなくしたのが今回である（#95 S4a・D6）。
  it("代理だけが残る場合はルームごと破棄される（代理は名簿に居ない）", async () => {
    // Given: 代理を 1 名追加する。代理は輪の上のラベルであって名簿の住人ではない
    await handlers.handleCommand(HOST, {
      command: "participant.addProxy", displayName: "Proxy", participantId: "ignored-client-supplied",
    });
    // 前提の確認: 輪には代理の席がある（この席が残っていても破棄されることが主題）
    expect(timers.get(code)!.session.rotation.some((e) => e.kind === "proxy")).toBe(true);
    broadcaster.sent.length = 0;

    // When: 名簿の在室者が Alice だけの状態で、Alice が抜ける
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: pidOf("Alice"),
    });

    // Then: 名簿が空になったのでルームごと消える（代理だけが残る部屋は作らない）
    result._unsafeUnwrap();
    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
  });

  it("他人を退出させて自分が残る通常の退出は、ルームを破棄しない", async () => {
    // Given
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    const bobId = pidOf("Bob");
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: bobId,
    });

    // Then: 従来どおり snapshot と notice が配信され、ルームは残る
    result._unsafeUnwrap();
    expect(store.get(code)).toBeDefined();
    expect(roomViewOf(store, timers, code).participants).toHaveLength(1);
    expect(broadcaster.snapshots.map((s) => s.roomCode)).toContain(code);
    expect(broadcaster.signalsOf("notice").map((s) => s.action)).toContain("participant-removed");
  });
});

// ─── 破棄の経路はアイドル回収と同じもの ──────────────────────────────────────
//
// ルームが消える契機は「アイドル回収（TTL）」と「在室者が 0 人になる退出」の 2 つになった。
// 契機ごとに後始末を並べると、片方だけが更新されて必ずずれる（消えた部屋のタイマーが残る）。

/**
 * @requirements Issue #79
 */
describe("アイドル回収と在室者0人の退出は同じ後始末を通る", () => {
  it("TTL 回収と退出破棄が、同じ破棄経路で同じ後始末を行う", async () => {
    // Given: 破棄経路をひとつだけ作り、回収（TTL）と退出（handlers）の両方に配線する
    const store = new InMemoryRoomStore();
    const timers = new InMemoryTimerStore();
    const broadcaster = new SpyBroadcaster();
    const { destroy, calls } = spyDestroyer(store, timers);
    const handlers = makeHandlers({
      store,
      timers,
      clock: new FakeClock(1_000_000),
      broadcaster,
      hub: spyHub(),
      codeGen: new FakeCodeGen(),
      tokens: createTokenStore(),
      toolGate: testToolGate({ timers }),
      rateLimiter: testRateLimiter(),
      maxRooms: TEST_MAX_ROOMS,
      destroyRoom: destroy,
    });
    const reclaimer = new RoomReclaimer({
      store,
      idleTtlMs: 1_000,
      onReclaim: (roomCode) => destroy(roomCode),
    });

    // Given: 退出で消える部屋（ソロ）と、TTL で消える部屋（全員 offline）を 1 つずつ
    const leaveCreated = await handlers.handleCommand("dr-host", {
      command: "room.create", displayName: "Alice", config: soloConfig,
    });
    if (!leaveCreated.isOk()) throw new Error("room.create failed");
    const leaveCode = broadcaster.createdFor("dr-host").code;
    const aliceId = roomViewOf(store, timers, leaveCode).participants[0]!.participantId;

    const idleCreated = await handlers.handleCommand("dr-idle", {
      command: "room.create", displayName: "Zoe", config: soloConfig,
    });
    if (!idleCreated.isOk()) throw new Error("room.create failed");
    const idleCode = broadcaster.createdFor("dr-idle").code;
    putRoomView(store, timers, {
      ...roomViewOf(store, timers, idleCode),
      participants: roomViewOf(store, timers, idleCode).participants.map((p) => ({ ...p, presence: "offline" as const })),
    });

    // When
    const left = await handlers.handleCommand("dr-host", {
      command: "participant.remove", participantId: aliceId,
    });
    left._unsafeUnwrap();
    reclaimer.sweep(0);
    reclaimer.sweep(2_000);

    // Then: 2 つの契機は、対象のコードが違うだけで同じ後始末の並びを通る
    const forRoom = (roomCode: string): string[] =>
      calls.filter((c) => c.endsWith(`:${roomCode}`)).map((c) => c.split(":")[0]!);
    expect(forRoom(leaveCode)).toEqual([
      "scheduler.clear", "delegator.cancel", "presence.clearRoomTimers", "releaseRoom",
    ]);
    expect(forRoom(idleCode)).toEqual(forRoom(leaveCode));
    expect(store.list()).toEqual([]);
  });
});
