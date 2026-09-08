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
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyDestroyer } from "./support/spy-destroyer.js";
import type { SessionConfig } from "@tasuki/timer-core";

const soloConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice"],
  intervalMinutes: 5,
};

describe("ソロの部屋からの退出（Issue #79）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const HOST = "solo-host";
  const BOB = "solo-bob";

  const pidOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

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
    broadcaster = new SpyBroadcaster();
    // 破棄経路は本番（create-sync-server.ts）と同じ形で組む。handlers が destroyRoom を
    // 要り、destroyRoom が handlers.releaseRoom を要る相互依存を、後から代入する
    // クロージャで解く。既定値に頼らないのは、頼ると本番の配線漏れを取り逃がすため
    // （HandlerDeps.destroyRoom の docstring 参照）。
    let destroyRoom: (roomCode: string) => void;
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
      destroyRoom: (roomCode) => destroyRoom(roomCode),
    });
    destroyRoom = createRoomDestroyer({ store, releaseRoom: handlers.releaseRoom });
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
    const room = store.get(code)!;

    // Then: この 1 人が rotation の最後の 1 人でもあるため、従来は退出が拒否されていた
    expect(room.participants).toHaveLength(1);
    expect(room.session.rotation).toEqual([pidOf("Alice")]);
  });

  it("ソロのホストは自己退出でき、ルームごと破棄される", async () => {
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
    const spyBroadcaster = new SpyBroadcaster();
    const { destroy, calls } = spyDestroyer(spyStore);
    const spyHandlers = makeHandlers({
      store: spyStore,
      clock: new FakeClock(1_000_000),
      broadcaster: spyBroadcaster,
      codeGen: new FakeCodeGen(),
      destroyRoom: destroy,
    });
    const created = await spyHandlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config: soloConfig,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    const soloCode = spyBroadcaster.createdFor(HOST).code;
    const aliceId = spyStore.get(soloCode)!.participants[0]!.participantId;

    // When
    const result = await spyHandlers.handleCommand(HOST, {
      command: "participant.remove", participantId: aliceId,
    });

    // Then: server.ts のアイドル回収と同じ 5 つの後始末を、同じ順序で通る
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

/**
 * @requirements Issue #79
 */
describe("ソロ以外は挙動が変わらない（Issue #79）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const HOST = "keep-host";
  const BOB = "keep-bob";

  const pidOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

  const lastError = (connId: string): { code: string; message: string } | undefined => {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  };

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    // 破棄経路は本番（create-sync-server.ts）と同じ形で組む。handlers が destroyRoom を
    // 要り、destroyRoom が handlers.releaseRoom を要る相互依存を、後から代入する
    // クロージャで解く。既定値に頼らないのは、頼ると本番の配線漏れを取り逃がすため
    // （HandlerDeps.destroyRoom の docstring 参照）。
    let destroyRoom: (roomCode: string) => void;
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
      destroyRoom: (roomCode) => destroyRoom(roomCode),
    });
    destroyRoom = createRoomDestroyer({ store, releaseRoom: handlers.releaseRoom });
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
    expect(store.get(code)!.session.rotation).toEqual([pidOf("Bob")]);
    broadcaster.sent.length = 0;

    // When: rotation 上の最後の 1 人である Bob が自己退出しようとする
    const result = await handlers.handleCommand(BOB, {
      command: "participant.remove", participantId: pidOf("Bob"),
    });

    // Then: 拒否され、ルームも Bob も残る（在室者 0 人にならないため破棄しない）
    expect(result.isErr()).toBe(true);
    expect(lastError(BOB)?.code).toBe("BelowMinMembers");
    expect(store.get(code)).toBeDefined();
    expect(store.get(code)!.participants).toHaveLength(2);
  });

  it("代理だけが残る場合も破棄しない（代理は在室者に数える）", async () => {
    // Given: 代理を 1 名追加する。代理は自分では退出しないので部屋に残り続ける
    await handlers.handleCommand(HOST, {
      command: "participant.addProxy", displayName: "Proxy", participantId: "ignored-client-supplied",
    });
    broadcaster.sent.length = 0;

    // When: 唯一の実在の編集者以上である Alice が抜けようとする
    const result = await handlers.handleCommand(HOST, {
      command: "participant.remove", participantId: pidOf("Alice"),
    });

    // Then: 「進行できる人が残らない」で拒否され、ルームは破棄されない
    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("LAST_MANAGER_LEAVE");
    expect(store.get(code)).toBeDefined();
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
    expect(store.get(code)!.participants).toHaveLength(1);
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
    const broadcaster = new SpyBroadcaster();
    const { destroy, calls } = spyDestroyer(store);
    const handlers = makeHandlers({
      store,
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
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
    const aliceId = store.get(leaveCode)!.participants[0]!.participantId;

    const idleCreated = await handlers.handleCommand("dr-idle", {
      command: "room.create", displayName: "Zoe", config: soloConfig,
    });
    if (!idleCreated.isOk()) throw new Error("room.create failed");
    const idleCode = broadcaster.createdFor("dr-idle").code;
    store.put({
      ...store.get(idleCode)!,
      participants: store.get(idleCode)!.participants.map((p) => ({ ...p, presence: "offline" as const })),
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
