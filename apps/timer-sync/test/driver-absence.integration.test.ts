/**
 * ドライバー不在 自動繰上の統合テスト（v2.2 R2-1）
 *
 * 各タスク単体テスト（presence の不在タイマー／handlers の advanceForAbsence）では
 * onDriverAbsence をモック・advanceForAbsence を直呼びしており、両者の「実配線」を
 * 跨いでいない。本テストは server.ts と同じ配線
 *   onDriverAbsence: handlers.advanceForAbsence
 * を実オブジェクトで組み、「切断 → 不在タイマー発火 → 実交代 → currentIndex 前進」の
 * 鎖を一本で検証する。将来の配線断線（参照ミス等）を回帰検出するためのもの。
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import {
  PresenceManager,
  DRIVER_ABSENCE_GRACE_MS,
} from "../src/application/presence.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { SessionConfig, Room } from "@tasuki/timer-core";
import { FakeCodeGen } from "./support/fake-code-gen.js";

class NoopBroadcaster implements Broadcaster {
  broadcastSnapshot(): void {}
  sendTo(): void {}
  broadcastSignal(): void {}
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A", "B"],
  intervalMinutes: 5,
};

/**
 * @requirements v2.2 R2-1
 */
describe("統合: ドライバー不在 自動繰上（presence→handlers 実配線）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let handlers: ReturnType<typeof makeHandlers>;
  let presence: PresenceManager;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    const broadcaster = new NoopBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
    // server.ts と同じ配線。これが本テストの主眼。
    presence = new PresenceManager({
      store,
      broadcaster,
      clock,
      onDriverAbsence: handlers.advanceForAbsence,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** 稼働中・rotation [A,B]・現ドライバー=A(online)・B(online) の room を store に置く。 */
  async function setupRunningRoom(): Promise<string> {
    const create = await handlers.handleCommand("conn-A", {
      command: "room.create",
      displayName: "A",
      config,
    });
    if (!create.isOk()) throw new Error("create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    const code = store.list().at(-1)!.code;
    const room = store.get(code)!;
    const host = room.participants[0]!;
    const participants: Room["participants"] = ["A", "B"].map((name, i) => ({
      ...host,
      participantId: `pid-test-${i}`,
      connId: `conn-${name}`,
      displayName: name,
      presence: "online",
    }));
    store.put({
      ...room,
      participants,
      session: { ...room.session, rotation: participants.map((p) => p.participantId), currentIndex: 0 },
      clock: { ...room.clock, running: true },
    });
    return code;
  }

  it("現ドライバー切断→猶予後に実 handlers が currentIndex を次の online へ進める", async () => {
    // Given
    const code = await setupRunningRoom();

    // When（現ドライバー A が切断 → presence が offline 化し不在タイマーを張る）
    presence.handleDisconnect("conn-A");
    expect(store.get(code)!.session.currentIndex).toBe(0); // 猶予中は不変
    // 猶予経過 → stale-check 通過 → handlers.advanceForAbsence で B(1) へ繰り上げ
    jest.advanceTimersByTime(DRIVER_ABSENCE_GRACE_MS);

    // Then
    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(1);
    expect(after.session.rotation[after.session.currentIndex]).toBe("pid-test-1"); // B
  });
});
