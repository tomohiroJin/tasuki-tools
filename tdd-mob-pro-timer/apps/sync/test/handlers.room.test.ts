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

  it("maxRooms に達した場合、2件目の room.create は ROOM_LIMIT_EXCEEDED を返す", async () => {
    // 1件目は成功する
    const first = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    expect(first.isOk()).toBe(true);

    // 2件目はルーム上限に達しているので失敗する
    const second = await handlers.handleCommand("conn-002", {
      command: "room.create",
      displayName: "Bob",
    });
    expect(second.isErr()).toBe(true);
    if (second.isErr()) {
      expect(second.error).toBe("ROOM_LIMIT_EXCEEDED");
    }

    // conn-002 に error メッセージが届いていること
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

  it("releaseRoom はエラーなく実行でき、同じコードで2回呼んでも冪等である", async () => {
    const result = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const { code } = result.value;

    // 1回目: エラーなく実行できること
    expect(() => handlers.releaseRoom(code)).not.toThrow();
    // 2回目（冪等性）: 2回目もエラーなく実行できること
    expect(() => handlers.releaseRoom(code)).not.toThrow();
  });

  it("releaseRoom 後はリジュームトークンが無効化される", async () => {
    const result = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const { code, resumeToken } = result.value;

    // releaseRoom でトークンを解放する
    handlers.releaseRoom(code);

    // リジュームトークンを使った参加が新規参加として扱われること（ルームが既に存在する場合）
    // ルームは store に残っているが resumeToken は無効化されているため、新規 participantId が割り当てられる
    const joinResult = await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });
    // ルームは store に残っているので参加自体は成功するが
    // resumeToken が無効化されているため、新規参加者として別の participantId が発行される
    expect(joinResult.isOk()).toBe(true);
    if (joinResult.isOk()) {
      // 元の participantId とは異なる新規 participantId が発行される
      expect(joinResult.value.participantId).not.toBe(result.value.participantId);
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
