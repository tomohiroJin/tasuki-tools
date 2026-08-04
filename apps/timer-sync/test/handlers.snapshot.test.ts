/**
 * Full snapshot 配信フローのテスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements FR-013, FR-015
 */
describe("handlers: full snapshot 配信フロー", () => {
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

  it("コマンド処理後に全参加者へ snapshot を配信する", async () => {
    // Given
    const command = { command: "room.create", displayName: "Alice" } as const;

    // When
    const createResult = await handlers.handleCommand("conn-001", command);
    if (!createResult.isOk()) throw new Error("create failed");

    // Then
    const snapshots = broadcaster.snapshots.filter(
      (s) => s.roomCode === broadcaster.createdFor("conn-001").code,
    );
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("コマンドエラー時は snapshot を配信せず error を返す", async () => {
    // Given（存在しないルームコードを対象にする）
    const command = {
      command: "room.join", code: "INVALID", displayName: "Bob", hasAiKey: false,
    } as const;

    // When
    await handlers.handleCommand("conn-999", command);

    // Then
    const errors = broadcaster.sent.filter((s) => s.msg.type === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(broadcaster.snapshots.length).toBe(0);
  });

  it("同一ルームへの複数コマンド処理後も不変条件（ローテーション人数の整合）が保たれる", async () => {
    // Given
    const createResult = await handlers.handleCommand("conn-001", {
      command: "room.create",
      displayName: "Alice",
    });
    if (!createResult.isOk()) throw new Error("create failed");
    const code = broadcaster.createdFor("conn-001").code;
    const room1 = store.get(code);

    // When（host のみ操作可能なので、viewer 参加の冪等確認として再度 join する）
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

    // Then（ルーム自体は変化しているが、不変条件は保たれている）
    const room2 = store.get(code);
    expect(room2?.session.rotation.length).toBe(room1?.session.rotation.length);
  });
});
