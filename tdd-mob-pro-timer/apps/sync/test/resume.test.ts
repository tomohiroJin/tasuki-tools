/**
 * 再接続・復帰テスト
 * T046: FR-019, SC-005
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
  generate(): string { return `RS${String(++this._counter).padStart(2, "0")}`; }
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

describe("resume: 再接続・復帰（FR-019, SC-005）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("resumeToken で同一参加者・同一 role として復帰する（FR-019）", async () => {
    // ルーム作成
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    const { code, resumeToken, participantId } = createResult.value;

    broadcaster.sent.length = 0;

    // 別の接続で resumeToken を使って再参加
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });

    const room = store.get(code);
    const participant = room?.participants.find(
      (p) => p.participantId === participantId,
    );

    // 同一参加者として認識され connId が更新されている
    expect(participant?.connId).toBe("conn-002");
    expect(participant?.role).toBe("host");
  });

  it("再接続後に snapshot で完全同期する（SC-005）", async () => {
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    const { code, resumeToken } = createResult.value;

    broadcaster.sent.length = 0;

    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });

    const snapshot = broadcaster.sent.find((s) => s.msg.type === "snapshot");
    expect(snapshot).toBeTruthy();
    if (snapshot?.msg.type === "snapshot") {
      expect(snapshot.msg.room.code).toBe(code);
    }
  });

  it("無効な resumeToken は新規参加者として扱う", async () => {
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    const { code } = createResult.value;

    await handlers.handleCommand("conn-003", {
      command: "room.join",
      code,
      displayName: "Charlie",
      hasAiKey: false,
      resumeToken: "invalid-token-xyz",
    });

    const room = store.get(code);
    const charlie = room?.participants.find((p) => p.displayName === "Charlie");
    expect(charlie).toBeTruthy();
    // 既定 editor で新規参加扱い（UX 再設計）。
    expect(charlie?.role).toBe("editor");
  });
});
