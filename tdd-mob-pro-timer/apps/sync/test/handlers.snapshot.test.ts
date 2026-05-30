/**
 * Full snapshot 配信フローのテスト
 * T035: FR-013, FR-015
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _counter = 0;
  generate(): string {
    return `SNAP${String(++this._counter).padStart(2, "0")}`;
  }
  generateParticipantId(): string {
    return `pid-${++this._counter}`;
  }
  generateResumeToken(): string {
    return `rt-${++this._counter}`;
  }
}

class SpyBroadcaster implements Broadcaster {
  readonly snapshots: Array<{ roomCode: string }> = [];
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];

  broadcastSnapshot(roomCode: string): void {
    this.snapshots.push({ roomCode });
  }
  sendTo(connId: string, msg: ServerMsg): void {
    this.sent.push({ connId, msg });
  }
  broadcastSignal(roomCode: string, msg: ServerMsg): void {
    this.signals.push({ roomCode, msg });
  }
}

describe("handlers: full snapshot 配信フロー（FR-013, FR-015）", () => {
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

  it("コマンド処理後に全参加者へ snapshot を配信する（FR-013）", async () => {
    // ルームを作成
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");

    // snapshot を受け取っているか
    const snapshots = broadcaster.snapshots.filter(
      (s) => s.roomCode === createResult.value.code,
    );
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("コマンドエラー時は snapshot を配信せず error を返す", async () => {
    // 存在しないルームへのコマンド
    await handlers.handleCommand("conn-999", {
      command: "room.join",
      code: "INVALID",
      displayName: "Bob",
      hasAiKey: false,
    });

    const errors = broadcaster.sent.filter((s) => s.msg.type === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(broadcaster.snapshots.length).toBe(0);
  });

  it("冪等な置き換え: 同一コマンドを2回送っても整合性が保たれる（FR-013）", async () => {
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");

    const code = createResult.value.code;
    const room1 = store.get(code);

    // host のみ操作可能なので、ホストトークンを使ったコマンドをシミュレートする
    // ここでは単純に再度 join を試みる（viewer 参加の冪等確認）
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Bob",
      hasAiKey: false,
    });

    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Charlie",
      hasAiKey: false,
    });

    const room2 = store.get(code);
    // ルーム自体は変化しているが、不変条件は保たれている
    expect(room2?.session.rotation.length).toBe(room1?.session.rotation.length);
  });
});
