/**
 * room.join 失敗のレート制限と、接続クローズ時の失敗履歴解放（リーク防止）のテスト。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

class NullBroadcaster implements Broadcaster {
  broadcastSnapshot(): void {}
  sendTo(): void {}
  broadcastSignal(): void {}
}

const JOIN_FAIL_MAX = 30;
const badJoin = (handlers: ReturnType<typeof makeHandlers>, conn: string) =>
  handlers.handleCommand(conn, {
    command: "room.join",
    code: "NOPE99",
    displayName: "Bob",
    hasAiKey: false,
  });

describe("room.join レート制限と失敗履歴の解放", () => {
  let handlers: ReturnType<typeof makeHandlers>;
  const conn = "spam-conn";

  beforeEach(() => {
    handlers = makeHandlers({
      store: new InMemoryRoomStore(),
      clock: new FakeClock(1_000_000),
      broadcaster: new NullBroadcaster(),
      codeGen: new FakeCodeGen(),
    });
  });

  it("連続失敗が上限を超えると RATE_LIMITED で拒否する", async () => {
    // Given（上限までは ROOM_NOT_FOUND）
    for (let i = 0; i < JOIN_FAIL_MAX; i++) {
      const r = await badJoin(handlers, conn);
      expect(r.isErr() && r.error).toBe("ROOM_NOT_FOUND");
    }

    // When
    const blocked = await badJoin(handlers, conn);

    // Then
    expect(blocked.isErr() && blocked.error).toBe("RATE_LIMITED");
  });

  it("接続クローズで失敗履歴が解放され、再び試行できる（マップのリーク防止）", async () => {
    // Given
    for (let i = 0; i < JOIN_FAIL_MAX; i++) await badJoin(handlers, conn);
    expect((await badJoin(handlers, conn)).isErr() && (await badJoin(handlers, conn)).error).toBe("RATE_LIMITED");

    // When（切断で履歴クリア）
    handlers.handleConnectionClose(conn);

    // Then（次は通常の ROOM_NOT_FOUND。RATE_LIMITED ではない）
    const after = await badJoin(handlers, conn);
    expect(after.isErr() && after.error).toBe("ROOM_NOT_FOUND");
  });
});
