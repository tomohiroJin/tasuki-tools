/**
 * ドライバー不在の自動繰上（advanceForAbsence）のテスト（v2.2 R2-1）
 * presence の不在タイマー（Task 2）から呼ばれる前提の交代ロジックを検証する。
 * オフライン参加者を交代対象外（ineligible）に含め、次の online ドライバーへ
 * サーバー権威で繰り上げる。交代先が無ければ現状維持する。
 * 要件: v2.2 R2-1
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
  readonly snapshots: string[] = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];
  broadcastSnapshot(code: string): void { this.snapshots.push(code); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(roomCode: string, msg: ServerMsg): void { this.signals.push({ roomCode, msg }); }
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A", "B", "C"],
  intervalMinutes: 5,
};

/**
 * room.create でルームを作り、テスト用に rotation / currentIndex / clock.running /
 * 各参加者の presence を上書きして稼働状態の room を store に置く。
 * @param members rotation を構成するメンバー名（config.members と一致させる）
 * @param presenceByName 名前→presence の対応（指定外は online 扱い）
 */
async function setupRunningRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  members: string[],
  currentIndex: number,
  presenceByName: Record<string, Room["participants"][number]["presence"]>,
): Promise<string> {
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: members[0]!,
    config: { ...config, members },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;

  const room = store.get(code)!;
  // 各メンバーが participant として存在するよう presence を設定する。
  // room.create では host(members[0]) のみ participant なので、
  // rotation 上の名前すべてに対応する participant を組み立てる。
  const host = room.participants[0]!;
  const participants: Room["participants"] = members.map((name, i) => ({
    ...host,
    participantId: `pid-test-${i}`,
    connId: `conn-${i}`,
    displayName: name,
    presence: presenceByName[name] ?? "online",
  }));

  store.put({
    ...room,
    participants,
    session: { ...room.session, rotation: participants.map((p) => p.participantId), currentIndex },
    clock: { ...room.clock, running: true },
  });
  return code;
}

describe("advanceForAbsence: ドライバー不在の自動繰上（v2.2 R2-1）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("advanceForAbsence はオフラインの現ドライバーを飛ばして次の online へ繰り上げる", async () => {
    const code = await setupRunningRoom(handlers, store, ["A", "B", "C"], 0, {
      A: "offline",
      B: "online",
      C: "online",
    });

    handlers.advanceForAbsence(code);

    expect(store.get(code)!.session.currentIndex).toBe(1);
  });

  it("他が全員オフライン/ineligible なら現状維持（no-op）", async () => {
    const code = await setupRunningRoom(handlers, store, ["A", "B"], 0, {
      A: "offline",
      B: "offline",
    });

    handlers.advanceForAbsence(code);

    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("オフライン driver は交代対象から外れる（次が offline なら飛ばして現状維持）", async () => {
    const code = await setupRunningRoom(handlers, store, ["A", "B"], 0, {
      A: "online",
      B: "offline",
    });

    handlers.advanceForAbsence(code);

    // B(1) は offline で ineligible のため飛ばされ、交代先が無く現状維持
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });
});
