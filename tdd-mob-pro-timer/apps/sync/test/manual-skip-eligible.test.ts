/**
 * 手動スキップ（session.act SWITCH）も一時離脱(driverEligible=false)/オフライン(非placeholder)を
 * 飛ばして次の eligible へ進む（v2.10 #3）。自動交代と同じ eligible 判定に揃える。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig, Room } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `LC${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}
class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  broadcastSnapshot(): void {}
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}
const config: SessionConfig = { language: "TypeScript", difficulty: "easy", members: ["A"], intervalMinutes: 5 };

/** host A を作り、rotation [A,B,C] を稼働中にして B/C の eligibility を上書きした room を置く。 */
async function setup(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  bOverrides: Partial<Room["participants"][number]>,
): Promise<string> {
  const create = await handlers.handleCommand("conn-a", {
    command: "room.create", displayName: "A", config: { ...config, members: ["A"] },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;
  const room = store.get(code)!;
  const host = room.participants[0]!;
  const mk = (id: string, name: string, conn: string, ov: Partial<Room["participants"][number]> = {}): Room["participants"][number] =>
    ({ ...host, participantId: id, connId: conn, displayName: name, role: "editor", presence: "online", driverEligible: true, ...ov });
  store.put({
    ...room,
    participants: [host, mk("pid-b", "B", "conn-b", bOverrides), mk("pid-c", "C", "conn-c")],
    session: { ...room.session, rotation: ["A", "B", "C"], driverCounts: [0, 0, 0], currentIndex: 0 },
    clock: { ...room.clock, running: true },
  });
  return code;
}

describe("手動スキップの eligibility（v2.10 #3）", () => {
  let store: InMemoryRoomStore;
  let handlers: ReturnType<typeof makeHandlers>;
  beforeEach(() => {
    store = new InMemoryRoomStore();
    handlers = makeHandlers({ store, clock: new FakeClock(1_000_000), broadcaster: new SpyBroadcaster(), codeGen: new FakeCodeGen() });
  });

  it("一時離脱(driverEligible=false)の次メンバーを飛ばして次の eligible へ進む", async () => {
    const code = await setup(handlers, store, { driverEligible: false }); // B は一時離脱
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });
    expect(store.get(code)!.session.currentIndex).toBe(2); // B を飛ばして C へ
  });

  it("全員 eligible なら従来どおり次へ（+1）", async () => {
    const code = await setup(handlers, store, {}); // B も eligible
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });
    expect(store.get(code)!.session.currentIndex).toBe(1); // B へ
  });
});
