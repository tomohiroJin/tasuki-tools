/**
 * room.join 失敗のレート制限と、接続クローズ時の失敗履歴解放（リーク防止）のテスト。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

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
  let broadcaster: SpyBroadcaster;
  const conn = "spam-conn";

  beforeEach(() => {
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store: new InMemoryRoomStore(),
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("連続失敗が上限を超えると JOIN_RATE_LIMITED で拒否する", async () => {
    // Given（上限までは ROOM_NOT_FOUND）
    for (let i = 0; i < JOIN_FAIL_MAX; i++) {
      await badJoin(handlers, conn);
      expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("ROOM_NOT_FOUND");
    }

    // When
    await badJoin(handlers, conn);

    // Then
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  it("接続クローズで失敗履歴が解放され、再び試行できる（マップのリーク防止）", async () => {
    // Given
    for (let i = 0; i < JOIN_FAIL_MAX; i++) await badJoin(handlers, conn);
    await badJoin(handlers, conn);
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");

    // When（切断で履歴クリア）
    handlers.handleConnectionClose(conn);

    // Then（次は通常の ROOM_NOT_FOUND。JOIN_RATE_LIMITED ではない）
    await badJoin(handlers, conn);
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("ROOM_NOT_FOUND");
  });
});
