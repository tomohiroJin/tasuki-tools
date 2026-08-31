/**
 * time.ping ハンドラのテスト
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements FR-007, SC-001
 */
describe("handlers: time.ping", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1234567890);
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("time.pong でサーバー時刻を返す", async () => {
    // Given
    const command = { command: "time.ping", clientTime: 1234567880 } as const;

    // When
    await handlers.handleCommand("conn-001", command);

    // Then
    const pong = broadcaster.sent.find((s) => s.msg.type === "time.pong");
    expect(pong).toBeTruthy();
    if (pong?.msg.type === "time.pong") {
      expect(pong.msg.serverTime).toBe(1234567890);
    }
  });

  it("time.ping は状態を変えない（snapshot を配信しない）", async () => {
    // Given
    const command = { command: "time.ping", clientTime: 1234567880 } as const;

    // When
    await handlers.handleCommand("conn-001", command);

    // Then
    expect(broadcaster.snapshots).toHaveLength(0);
  });

  it("time.ping のレスポンスには clientTime は含まれない", async () => {
    // Given
    const command = { command: "time.ping", clientTime: 9999999999 } as const;

    // When
    await handlers.handleCommand("conn-001", command);

    // Then
    const pong = broadcaster.sent.find((s) => s.msg.type === "time.pong");
    expect(pong?.msg).not.toHaveProperty("clientTime");
  });
});
