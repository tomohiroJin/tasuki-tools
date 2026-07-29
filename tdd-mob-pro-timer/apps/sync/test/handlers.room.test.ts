/**
 * ルーム作成・参加ハンドラのテスト
 *
 * @requirements FR-011, FR-012, FR-016, US2
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { aRoom, makeTestHandlers } from "./support/room-builder.js";

describe("handlers: room.create", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let codeGen: FakeCodeGen;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    codeGen = new FakeCodeGen();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen });
  });

  it("ルームを作成すると一意のルームコードが発行される", async () => {
    // Given
    const command = { command: "room.create", displayName: "Alice" } as const;

    // When
    const result = await handlers.handleCommand("conn-001", command);

    // Then
    expect(result._unsafeUnwrap().code).toBeTruthy();
  });

  it("作成者は host ロールで登録される", async () => {
    // Given
    const command = { command: "room.create", displayName: "Alice" } as const;

    // When
    const result = await handlers.handleCommand("conn-001", command);

    // Then
    const value = result._unsafeUnwrap();
    const room = store.get(value.code);
    expect(room).toBeTruthy();
    const host = room?.participants.find(
      (p) => p.participantId === value.participantId,
    );
    expect(host?.role).toBe("host");
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
      expect(created.msg.hostToken).toBeTruthy();
      expect(created.msg.resumeToken).toBeTruthy();
      expect(created.msg.participantId).toBeTruthy();
    }
  });
});

describe("handlers: room.create — maxRooms 上限", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let codeGen: FakeCodeGen;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    codeGen = new FakeCodeGen();
    broadcaster = new SpyBroadcaster();
    // maxRooms: 1 で上限を1に設定
    handlers = makeHandlers({ store, clock, broadcaster, codeGen, maxRooms: 1 });
  });

  it("maxRooms に達すると次の room.create は ROOM_LIMIT_EXCEEDED で失敗する", async () => {
    // Given（1件目は上限に収まるので成功する）
    const first = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    first._unsafeUnwrap();

    // When
    const second = await handlers.handleCommand("conn-002", {
      command: "room.create",
      displayName: "Bob",
    });

    // Then
    expect(second.isErr()).toBe(true);
    if (second.isErr()) {
      expect(second.error).toBe("ROOM_LIMIT_EXCEEDED");
    }
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
    const broadcaster = new SpyBroadcaster();
    const handlers = makeTestHandlers({ store, broadcaster });
    const created = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!created.isOk()) throw new Error("room.create に失敗した");
    const { code, resumeToken, participantId } = created.value;
    handlers.releaseRoom(code);

    // When（ルームは store に残っているが resumeToken は無効化されている）
    const joinResult = await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });

    // Then（元の participantId とは異なる新規 participantId が発行される）
    expect(joinResult._unsafeUnwrap().participantId).not.toBe(participantId);
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

  it("新規参加者はデフォルトで editor になる（名乗って参加した人はすぐ回せる）", async () => {
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
    const stored = room.store.get(room.code);
    const bob = stored?.participants.find((p) => p.displayName === "Bob");
    expect(bob?.role).toBe("editor");
  });
});
