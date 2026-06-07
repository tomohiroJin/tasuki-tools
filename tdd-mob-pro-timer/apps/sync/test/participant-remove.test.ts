/**
 * participant.remove（ホストが参加者を退出させる・⑪）の結合テスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `RM${String(++this._c).padStart(4, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}
class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: Room[] = [];
  broadcastSnapshot(_c: string, room: Room): void { this.snapshots.push(room); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}
const latest = (b: SpyBroadcaster) => b.snapshots[b.snapshots.length - 1];

describe("participant.remove（⑪）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  const hostConn = "host-conn";
  const guestConn = "guest-conn";
  let guestId: string;

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
    guestId = store.get(code)!.participants.find((p) => p.displayName === "Bob")!.participantId;
    // Bob をローテーションに加える（host が member.add）→ rotation = [Alice, Bob]
    await handlers.handleCommand(hostConn, { command: "member.add", name: "Bob" });
    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("ホストが参加者を退出させ、一覧と rotation から消える", async () => {
    await handlers.handleCommand(hostConn, { command: "participant.remove", participantId: guestId });
    const room = latest(broadcaster);
    expect(room?.participants.find((p) => p.participantId === guestId)).toBeUndefined();
    expect(room?.session.rotation).not.toContain("Bob");
    expect(room?.session.rotation).toContain("Alice");
  });

  it("ホストでない参加者は実行できない（UNAUTHORIZED）", async () => {
    await handlers.handleCommand(guestConn, { command: "participant.remove", participantId: store.get(code)!.hostParticipantId });
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type === "error" && error.msg.code).toBe("UNAUTHORIZED");
  });

  it("自分自身は外せない", async () => {
    const hostId = store.get(code)!.hostParticipantId;
    await handlers.handleCommand(hostConn, { command: "participant.remove", participantId: hostId });
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    // ホストは残っている
    expect(store.get(code)!.participants.find((p) => p.participantId === hostId)).toBeTruthy();
  });

  it("最後の1人（rotation 1名）は外せない", async () => {
    // Bob を rotation から外して rotation=[Alice] に戻す
    await handlers.handleCommand(hostConn, { command: "member.remove", index: 1 });
    // Alice(host) は自分なので別の参加者で確認: Bob を再加入し Alice を rotation から抜く…
    // 単純化: rotation=[Alice] の状態で Bob(非rotation) を消すのは可能。最後の1人の保護は
    // 「rotation 上の最後の1人」を対象にした場合に効く。ここでは Bob を rotation に戻して
    // Alice を消そうとする（Alice は host=自分なので別経路）。代わりに rotation=[Bob] にして
    // host が Bob を消す→最後の1人で拒否、を検証する。
    await handlers.handleCommand(hostConn, { command: "member.add", name: "Bob" }); // [Alice, Bob]
    await handlers.handleCommand(hostConn, { command: "member.remove", index: 0 }); // [Bob]
    broadcaster.sent.length = 0;
    await handlers.handleCommand(hostConn, { command: "participant.remove", participantId: guestId });
    const error = broadcaster.sent.find((s) => s.msg.type === "error" && (s.msg as { code: string }).code === "BelowMinMembers");
    expect(error).toBeTruthy();
    // Bob はまだ居る（rotation 上の最後の1人なので拒否）
    expect(store.get(code)!.participants.find((p) => p.participantId === guestId)).toBeTruthy();
  });
});
