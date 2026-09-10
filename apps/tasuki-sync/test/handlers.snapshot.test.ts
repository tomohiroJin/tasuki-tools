/**
 * Full snapshot 配信フローのテスト
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
 * @requirements FR-013, FR-015
 */
describe("handlers: full snapshot 配信フロー", () => {
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
    const room1 = maybeRoomViewOf(store, timers, code);

    // When（同じ接続から続けて 2 度 join する。room.join は名簿に足すだけで
    //       session.rotation には触らないので、輪の人数は変わらないはず）
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
    const room2 = maybeRoomViewOf(store, timers, code);
    expect(room2?.session.rotation.length).toBe(room1?.session.rotation.length);
  });
});
