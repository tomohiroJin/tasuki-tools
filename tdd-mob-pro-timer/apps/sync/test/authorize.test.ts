/**
 * 権限・認可のテスト
 * T044: FR-016, FR-017, US5
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _counter = 0;
  generate(): string { return `AUTH${String(++this._counter).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._counter}`; }
  generateResumeToken(): string { return `rt-${++this._counter}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: string[] = [];
  readonly signals: string[] = [];
  broadcastSnapshot(code: string): void { this.snapshots.push(code); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(code: string): void { this.signals.push(code); }
}

describe("authorize: 権限テスト（FR-016, FR-017）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });

    // ルームを作成
    const result = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Host",
    });
    if (result.isOk()) {
      roomCode = result.value.code;
    }

    // viewer が参加
    await handlers.handleCommand("viewer-conn", {
      command: "room.join",
      code: roomCode,
      displayName: "Viewer",
      hasAiKey: false,
    });

    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("新規参加者はデフォルトで viewer（FR-016）", () => {
    const room = store.get(roomCode);
    const viewer = room?.participants.find((p) => p.displayName === "Viewer");
    expect(viewer?.role).toBe("viewer");
  });

  it("viewer は session.act を実行できない（FR-017）", async () => {
    await handlers.handleCommand("viewer-conn", {
      command: "session.act",
      action: "START",
    });

    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });

  it("viewer は session.reset を実行できない（FR-017）", async () => {
    await handlers.handleCommand("viewer-conn", {
      command: "session.reset",
    });

    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });

  it("viewer は phase.set を実行できない（FR-017）", async () => {
    await handlers.handleCommand("viewer-conn", {
      command: "phase.set",
      phase: "ready",
    });

    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
  });
});
