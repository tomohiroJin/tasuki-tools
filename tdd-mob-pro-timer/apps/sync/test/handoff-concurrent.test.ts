/**
 * 共有メモ（handoff.note.set）の同時書き込み挙動の検証（⑧）
 *
 * サーバーはコマンドを逐次処理し full snapshot を配信するため、複数人が
 * ほぼ同時に書いても「最後に処理された値」に収束する（last-write-wins）。
 * 破損や部分更新は起きないことを確認する。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("共有メモの同時書き込み（⑧ last-write-wins）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  const hostConn = "host-conn";
  const guestConn = "guest-conn";

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen() });
    const created = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
      config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    });
    if (created.isOk()) code = created.value.code;
    await handlers.handleCommand(guestConn, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
  });

  it("2人が続けて書くと最後の値に収束し、全員へ同じ snapshot が配信される", async () => {
    await handlers.handleCommand(hostConn, { command: "handoff.note.set", text: "Alice のメモ" });
    await handlers.handleCommand(guestConn, { command: "handoff.note.set", text: "Bob のメモ（最後）" });
    const room = store.get(code);
    expect(room?.handoffNote).toBe("Bob のメモ（最後）");
    // 直近 snapshot も同じ値（部分更新や破損がない）
    const last = broadcaster.snapshots[broadcaster.snapshots.length - 1];
    expect(last?.room.handoffNote).toBe("Bob のメモ（最後）");
  });

  it("交互に書いても毎回その時点の最終値で一貫する", async () => {
    const seq = ["a", "b", "c", "d"];
    for (let i = 0; i < seq.length; i++) {
      const conn = i % 2 === 0 ? hostConn : guestConn;
      await handlers.handleCommand(conn, { command: "handoff.note.set", text: seq[i]! });
      expect(store.get(code)?.handoffNote).toBe(seq[i]);
    }
  });
});
