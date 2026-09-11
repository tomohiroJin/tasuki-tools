/**
 * 再接続・復帰テスト
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { maybeRoomViewOf } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements FR-019, SC-005
 */
describe("resume: 再接続・復帰", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      timers,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("resumeToken で同一参加者として復帰する（参加者が増えない）", async () => {
    // Given
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    const { code, resumeToken, participantId } = broadcaster.createdFor("conn-001");
    broadcaster.sent.length = 0;

    // When（別の接続で resumeToken を使って再参加）
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });

    // Then（同一参加者として認識され connId が更新されている）
    const room = maybeRoomViewOf(store, timers, code);
    const participant = room?.participants.find(
      (p) => p.participantId === participantId,
    );
    expect(participant?.connId).toBe("conn-002");
    // 新しい参加者が増えていないこと（増えていれば「同一参加者として復帰した」とは言えない）。
    expect(room?.participants).toHaveLength(1);
  });

  it("再接続後に snapshot で完全同期する", async () => {
    // Given
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    const { code, resumeToken } = broadcaster.createdFor("conn-001");
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand("conn-002", {
      command: "room.join",
      code,
      displayName: "Alice",
      hasAiKey: false,
      resumeToken,
    });

    // Then
    const snapshot = broadcaster.sent.find((s) => s.msg.type === "snapshot");
    expect(snapshot).toBeTruthy();
    if (snapshot?.msg.type === "snapshot") {
      expect(snapshot.msg.room.code).toBe(code);
    }
  });

  it("無効な resumeToken は新規参加者として扱う", async () => {
    // Given
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    const { code } = broadcaster.createdFor("conn-001");

    // When
    await handlers.handleCommand("conn-003", {
      command: "room.join",
      code,
      displayName: "Charlie",
      hasAiKey: false,
      resumeToken: "invalid-token-xyz",
    });

    // Then（復帰ではなく新規参加として扱われ、別の participantId で人数が増える）
    const room = maybeRoomViewOf(store, timers, code);
    const charlie = room?.participants.find((p) => p.displayName === "Charlie");
    expect(charlie).toBeTruthy();
    expect(room?.participants).toHaveLength(2);
  });
});
