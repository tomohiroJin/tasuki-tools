/**
 * member.shuffle（モブ順のランダム化・サーバー権威）の sync テスト
 * v2.3 #1: サーバーが順列を生成し、稼働中は現ドライバー位置を固定する。host 限定。
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig, Room } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `SH${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshotRooms: Room[] = [];
  broadcastSnapshot(_code: string, room: Room): void { this.snapshotRooms.push(room); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A", "B", "C"],
  intervalMinutes: 5,
};

const HOST_CONN = "host-conn";

function latest(spy: SpyBroadcaster): Room | undefined {
  return spy.snapshotRooms[spy.snapshotRooms.length - 1];
}

/**
 * host(=members[0]) が居る稼働/非稼働ルームを作る。
 * rotation/currentIndex/driverCounts/clock.running を上書きして store に置く。
 */
async function setupRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  members: string[],
  currentIndex: number,
  running: boolean,
): Promise<string> {
  const create = await handlers.handleCommand(HOST_CONN, {
    command: "room.create",
    displayName: members[0]!,
    config: { ...config, members },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;

  const room = store.get(code)!;
  const host = room.participants[0]!; // role: host, connId: HOST_CONN
  // rotation 上の各名に participant を割り当てる。先頭は host（HOST_CONN）を維持する。
  const participants: Room["participants"] = members.map((name, i) =>
    i === 0
      ? { ...host, displayName: name }
      : {
          ...host,
          participantId: `pid-m-${i}`,
          connId: `conn-${i}`,
          role: "editor",
          displayName: name,
        },
  );

  store.put({
    ...room,
    participants,
    session: {
      ...room.session,
      // rotation は参加者IDの配列（D6b）
      rotation: participants.map((p) => p.participantId),
      currentIndex,
      driverCounts: members.map((_, i) => i + 1), // [1,2,3]
    },
    clock: { ...room.clock, running },
  });
  return code;
}

/** rotation（参加者IDの配列・D6b）を表示名へ写す。検証の意図は「並び」なので名前で見る。 */
function rotationNames(room: Room | undefined): string[] {
  if (!room) return [];
  return room.session.rotation.map(
    (id) => room.participants.find((p) => p.participantId === id)?.displayName ?? "",
  );
}

describe("member.shuffle（サーバー権威のランダム化・v2.3 #1）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("非稼働中: host の member.shuffle が ok で rotation が並べ替わる（Math.random 固定で決定的）", async () => {
    await setupRoom(handlers, store, ["A", "B", "C"], 0, false);
    // Fisher–Yates（i=2→j, i=1→j）で呼ばれる random を固定する。
    // i=2: Math.floor(r*3)、i=1: Math.floor(r*2)。
    // r=0 を返すと i=2 で j=0（[C,B,A]）、i=1 で j=0（[B,C,A]）。
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await handlers.handleCommand(HOST_CONN, { command: "member.shuffle" });
    expect(result.isOk()).toBe(true);

    const room = latest(broadcaster);
    expect(rotationNames(room)).toEqual(["B", "C", "A"]);
    // driverCounts も順列に追従する（元 [1,2,3] が order=[1,2,0] で並ぶ）。
    expect(room?.session.driverCounts).toEqual([2, 3, 1]);
    // config.members も rotation にミラーされる。
    expect(room?.config.members).toEqual(["B", "C", "A"]);
  });

  it("稼働中: 現ドライバーの位置が固定され、その名前が currentIndex で不変", async () => {
    // currentIndex=1（"B"）を稼働中にシャッフル。B の位置（index 1）は固定される。
    await setupRoom(handlers, store, ["A", "B", "C"], 1, true);
    // others=[0,2] をシャッフル。i=1: Math.floor(r*2)。r=0 で j=0（入れ替えなし→[0,2]）。
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await handlers.handleCommand(HOST_CONN, { command: "member.shuffle" });
    expect(result.isOk()).toBe(true);

    const room = latest(broadcaster);
    // currentIndex は 1 のまま、その名前は "B" のまま（現ドライバー現役）。
    expect(room?.session.currentIndex).toBe(1);
    expect(rotationNames(room)[1]).toBe("B");
  });

  it("稼働中: 現ドライバー名は順列の中身に関わらず保持される", async () => {
    await setupRoom(handlers, store, ["A", "B", "C"], 2, true);
    // others=[0,1] を i=1: r=0.99→Math.floor(0.99*2)=1 で入れ替え→[1,0]。
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await handlers.handleCommand(HOST_CONN, { command: "member.shuffle" });
    const room = latest(broadcaster);
    // 現ドライバー "C" は index 2 に固定。
    expect(rotationNames(room)[2]).toBe("C");
    expect(room?.session.currentIndex).toBe(2);
  });

  it("host 以外（editor）の member.shuffle は UNAUTHORIZED で拒否される", async () => {
    await setupRoom(handlers, store, ["A", "B", "C"], 0, false);
    // conn-1 は editor（"B"）。
    const result = await handlers.handleCommand("conn-1", { command: "member.shuffle" });
    expect(result.isErr()).toBe(true);
    result.mapErr((e) => expect(e).toBe("UNAUTHORIZED"));
  });
});
