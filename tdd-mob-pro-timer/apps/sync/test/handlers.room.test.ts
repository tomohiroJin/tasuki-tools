/**
 * ルーム作成・参加ハンドラのテスト
 * T033: FR-011, FR-012, US2
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg } from "@tdd-mob/core";

/** テスト用の決定論的コード生成 */
class FakeCodeGen implements RoomCodeGen {
  private _counter = 0;
  generate(): string {
    return `ROOM${String(++this._counter).padStart(2, "0")}`;
  }
  generateParticipantId(): string {
    return `pid-${++this._counter}`;
  }
  generateResumeToken(): string {
    return `rt-${++this._counter}`;
  }
}

/** テスト用 Broadcaster */
class SpyBroadcaster implements Broadcaster {
  readonly snapshots: Array<{ roomCode: string; room: unknown }> = [];
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];

  broadcastSnapshot(roomCode: string, room: unknown): void {
    this.snapshots.push({ roomCode, room });
  }
  sendTo(connId: string, msg: ServerMsg): void {
    this.sent.push({ connId, msg });
  }
  broadcastSignal(roomCode: string, msg: ServerMsg): void {
    this.signals.push({ roomCode, msg });
  }
}

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

  it("ルームを作成し一意のルームコードを発行する（FR-011）", async () => {
    const result = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.code).toBeTruthy();
    }
  });

  it("作成者は host として登録される（FR-016）", async () => {
    const result = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const room = store.get(result.value.code);
      expect(room).toBeTruthy();
      const host = room?.participants.find(
        (p) => p.participantId === result.value.participantId,
      );
      expect(host?.role).toBe("host");
    }
  });

  it("room.created メッセージを送信者に返す", async () => {
    await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });

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

describe("handlers: room.join", () => {
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

  it("有効なルームコードで参加できる（US2-AC2）", async () => {
    // まずルームを作成
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    expect(createResult.isOk()).toBe(true);
    if (!createResult.isOk()) return;

    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;

    // ルームに参加
    const joinResult = await handlers.handleCommand("conn-002", {
      command: "room.join",
      code: createResult.value.code,
      displayName: "Bob",
      hasAiKey: false,
    });

    expect(joinResult.isOk()).toBe(true);
  });

  it("参加時に最新状態を snapshot で受け取る（US2-AC2）", async () => {
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) return;

    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;

    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code: createResult.value.code,
      displayName: "Bob",
      hasAiKey: false,
    });

    const snapshot = broadcaster.sent.find((s) => s.msg.type === "snapshot");
    expect(snapshot).toBeTruthy();
  });

  it("無効なルームコードで参加を拒否し理由を返す（US2-AC3）", async () => {
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code: "INVALID",
      displayName: "Bob",
      hasAiKey: false,
    });

    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
  });

  it("新規参加者はデフォルトで editor になる（UX 再設計: 名乗って参加した人はすぐ回せる）", async () => {
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) return;

    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code: createResult.value.code,
      displayName: "Bob",
      hasAiKey: false,
    });

    const room = store.get(createResult.value.code);
    const bob = room?.participants.find((p) => p.displayName === "Bob");
    expect(bob?.role).toBe("editor");
  });
});
