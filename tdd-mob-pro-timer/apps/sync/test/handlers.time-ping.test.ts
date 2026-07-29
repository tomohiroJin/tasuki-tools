/**
 * time.ping ハンドラのテスト
 * T040b: FR-007, SC-001
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("handlers: time.ping", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1234567890);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("time.pong でサーバー時刻を返す（FR-007）", async () => {
    await handlers.handleCommand("conn-001", {
      command: "time.ping",
      clientTime: 1234567880,
    });

    const pong = broadcaster.sent.find((s) => s.msg.type === "time.pong");
    expect(pong).toBeTruthy();
    if (pong?.msg.type === "time.pong") {
      expect(pong.msg.serverTime).toBe(1234567890);
    }
  });

  it("time.ping は状態を変えない（snapshot を配信しない）", async () => {
    await handlers.handleCommand("conn-001", {
      command: "time.ping",
      clientTime: 1234567880,
    });

    expect(broadcaster.snapshots).toHaveLength(0);
  });

  it("time.ping のレスポンスには clientTime は含まれない", async () => {
    await handlers.handleCommand("conn-001", {
      command: "time.ping",
      clientTime: 9999999999,
    });

    const pong = broadcaster.sent.find((s) => s.msg.type === "time.pong");
    expect(pong?.msg).not.toHaveProperty("clientTime");
  });
});
