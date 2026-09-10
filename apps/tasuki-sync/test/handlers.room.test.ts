/**
 * ルーム作成・参加ハンドラのテスト
 *
 * @requirements FR-011, FR-012, FR-016, US2
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { maybeRoomViewOf } from "./support/room-view.js";
import { aRoom, makeTestHandlers } from "./support/room-builder.js";

describe("handlers: room.create", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let codeGen: FakeCodeGen;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    codeGen = new FakeCodeGen();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen });
  });

  it("ルームを作成すると一意のルームコードが発行される", async () => {
    // Given
    const command = { command: "room.create", displayName: "Alice" } as const;

    // When
    await handlers.handleCommand("conn-001", command);

    // Then
    expect(broadcaster.createdFor("conn-001").code).toBeTruthy();
  });

  // #95 S3 以前は「作成者は host ロールで登録される」ことをここで固定していた。
  // 役割の廃止で作成者も 1 人の在室者にすぎなくなったため、
  // 「room.created が指す participantId で在室者として引ける」ことを固定し直す。
  it("作成者は在室者として登録され、room.created の participantId で引ける", async () => {
    // Given
    const command = { command: "room.create", displayName: "Alice" } as const;

    // When
    await handlers.handleCommand("conn-001", command);

    // Then
    const value = broadcaster.createdFor("conn-001");
    const room = maybeRoomViewOf(store, timers, value.code);
    expect(room).toBeTruthy();
    const creator = room?.participants.find(
      (p) => p.participantId === value.participantId,
    );
    expect(creator?.displayName).toBe("Alice");
    expect(creator?.connId).toBe("conn-001");
    expect(room?.participants).toHaveLength(1);
  });

  it("room.created メッセージを送信者に返す", async () => {
    // Given
    const command = { command: "room.create", displayName: "Alice" } as const;

    // When
    await handlers.handleCommand("conn-001", command);

    // Then
    const created = broadcaster.sent.find(
      (s) => s.msg.type === "room.created",
    );
    expect(created).toBeTruthy();
    if (created?.msg.type === "room.created") {
      expect(created.msg.code).toBeTruthy();
      expect(created.msg.resumeToken).toBeTruthy();
      expect(created.msg.participantId).toBeTruthy();
    }
  });
});

describe("handlers: room.create — maxRooms 上限", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let codeGen: FakeCodeGen;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    codeGen = new FakeCodeGen();
    broadcaster = new SpyBroadcaster();
    // maxRooms: 1 で上限を1に設定
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen, maxRooms: 1 });
  });

  it("maxRooms に達すると次の room.create は ROOM_LIMIT_EXCEEDED で失敗する", async () => {
    // Given（1件目は上限に収まるので成功する）
    const first = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    first._unsafeUnwrap();

    // When
    await handlers.handleCommand("conn-002", {
      command: "room.create",
      displayName: "Bob",
    });

    // Then
    expect(broadcaster.errorsTo("conn-002").at(-1)?.code).toBe("ROOM_LIMIT_EXCEEDED");
  });

  it("maxRooms に達したとき、拒否された接続へ error メッセージが届く", async () => {
    // Given
    await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });

    // When
    await handlers.handleCommand("conn-002", {
      command: "room.create",
      displayName: "Bob",
    });

    // Then
    const errorMsg = broadcaster.sent.find(
      (s) => s.connId === "conn-002" && s.msg.type === "error",
    );
    expect(errorMsg).toBeTruthy();
    if (errorMsg?.msg.type === "error") {
      expect(errorMsg.msg.code).toBe("ROOM_LIMIT_EXCEEDED");
    }
  });
});

describe("handlers: releaseRoom", () => {
  it("releaseRoom は同じコードで2回呼んでもエラーにならない（冪等）", async () => {
    // Given
    const room = await aRoom().build();

    // When（同じコードで2回呼ぶ）
    const call = () => room.handlers.releaseRoom(room.code);

    // Then
    expect(call).not.toThrow();
    expect(call).not.toThrow();
  });

  it("releaseRoom 後はリジュームトークンが無効化され、再参加が新規参加者として扱われる", async () => {
    // Given
    const store = new InMemoryRoomStore();
    const timers = new InMemoryTimerStore();
    const broadcaster = new SpyBroadcaster();
    const handlers = makeTestHandlers({ store, timers, broadcaster });
    const created = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!created.isOk()) throw new Error("room.create に失敗した");
    const { code, resumeToken, participantId } = broadcaster.createdFor("conn-001");
    handlers.releaseRoom(code);

    // When（ルームは store に残っているが resumeToken は無効化されている）
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });

    // Then（元の participantId とは異なる新規 participantId が発行される）
    expect(broadcaster.joinedFor("conn-002").participantId).not.toBe(participantId);
  });
});

describe("handlers: room.join", () => {
  it("有効なルームコードで参加できる", async () => {
    // Given
    const room = await aRoom().build();

    // When
    const joinResult = await room.handlers.handleCommand("conn-002", {
      command: "room.join",
      code: room.code,
      displayName: "Bob",
      hasAiKey: false,
    });

    // Then
    expect(joinResult.isOk()).toBe(true);
  });

  it("参加時に最新状態を snapshot で受け取る", async () => {
    // Given
    const room = await aRoom().build();

    // When
    await room.handlers.handleCommand("conn-002", {
      command: "room.join",
      code: room.code,
      displayName: "Bob",
      hasAiKey: false,
    });

    // Then
    const snapshot = room.broadcaster.sent.find((s) => s.msg.type === "snapshot");
    expect(snapshot).toBeTruthy();
  });

  it("無効なルームコードで参加を拒否し理由を返す", async () => {
    // Given
    const broadcaster = new SpyBroadcaster();
    const handlers = makeTestHandlers({ broadcaster });

    // When
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code: "INVALID",
      displayName: "Bob",
      hasAiKey: false,
    });

    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
  });

  it("新規参加者は在室者として登録される（名乗って参加した人はすぐ回せる）", async () => {
    // Given
    const room = await aRoom().build();

    // When
    await room.handlers.handleCommand("conn-002", {
      command: "room.join",
      code: room.code,
      displayName: "Bob",
      hasAiKey: false,
    });

    // Then
    const stored = maybeRoomViewOf(room.store, room.timers, room.code);
    const bob = stored?.participants.find((p) => p.displayName === "Bob");
    expect(bob?.connId).toBe("conn-002");
    expect(bob?.presence).toBe("online");
  });
});
