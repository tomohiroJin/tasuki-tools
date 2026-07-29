/**
 * 再接続・復帰テスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements FR-019, SC-005
 */
describe("resume: 再接続・復帰", () => {
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

  it("resumeToken で同一参加者・同一 role として復帰する", async () => {
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
    const room = store.get(code);
    const participant = room?.participants.find(
      (p) => p.participantId === participantId,
    );
    expect(participant?.connId).toBe("conn-002");
    expect(participant?.role).toBe("host");
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

    // Then（既定 editor で新規参加扱い・UX 再設計）
    const room = store.get(code);
    const charlie = room?.participants.find((p) => p.displayName === "Charlie");
    expect(charlie).toBeTruthy();
    expect(charlie?.role).toBe("editor");
  });
});
