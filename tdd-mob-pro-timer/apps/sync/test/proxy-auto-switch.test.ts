/**
 * 代理メンバー（placeholder）へのタイマー自動交代（v2.8 バグ修正）
 *
 * 代理参加者は presence="offline"・isPlaceholder=true・driverEligible=true で作られる
 * （Web 非接続だが対面で在席する実在の人を表す）。タイマー自動交代（autoSwitch=
 * advanceForAbsence）が presence="offline" だけで ineligible 判定すると、代理が
 * 永久に飛ばされ「時間が来ても交代しない」状態になる（手動 SWITCH は eligible 無視で進む）。
 * placeholder は offline でも eligible として扱い、自動交代で回ってくる必要がある。
 * 一方、実在の offline 参加者（非 placeholder）は従来どおり飛ばす（R2-1 維持）。
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
  members: ["A"],
  intervalMinutes: 5,
};

/** host A のみのルームを作り、稼働中(running) にして rotation に代理 B を加えた room を store に置く。
 *  proxyOpts で B の placeholder/presence を切り替えて「代理」と「実在の offline 参加者」を作り分ける。 */
async function setupRoomWithSecond(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  second: { presence: Room["participants"][number]["presence"]; isPlaceholder: boolean },
): Promise<string> {
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: "A",
    config: { ...config, members: ["A"] },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;
  const room = store.get(code)!;
  const host = room.participants[0]!;
  const secondParticipant: Room["participants"][number] = {
    ...host,
    participantId: "pid-second-B",
    connId: null,
    displayName: "B",
    role: "editor",
    presence: second.presence,
    isPlaceholder: second.isPlaceholder,
    driverEligible: true,
  };
  store.put({
    ...room,
    participants: [host, secondParticipant],
    session: { ...room.session, rotation: ["A", "B"], driverCounts: [0, 0], currentIndex: 0 },
    clock: { ...room.clock, running: true },
  });
  return code;
}

describe("タイマー自動交代と代理メンバー（v2.8）", () => {
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

  it("代理メンバー(offline+placeholder)へ自動交代が進む", async () => {
    const code = await setupRoomWithSecond(handlers, store, { presence: "offline", isPlaceholder: true });

    handlers.advanceForAbsence(code); // = autoSwitch（タイマー発火相当）

    expect(store.get(code)!.session.currentIndex).toBe(1); // 代理 B へ交代している
  });

  it("実在の offline 参加者(非placeholder)は従来どおり飛ばす（R2-1 維持）", async () => {
    const code = await setupRoomWithSecond(handlers, store, { presence: "offline", isPlaceholder: false });

    handlers.advanceForAbsence(code);

    // B は実在の offline で ineligible → 飛ばされ交代先なし → 現状維持
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });
});
