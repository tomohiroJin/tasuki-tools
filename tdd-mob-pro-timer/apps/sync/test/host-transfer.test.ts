/**
 * 明示的ホスト移譲ハンドラ（host.transfer）テスト
 * v2.2 R2-3: 主催者が任意のオンライン参加者へホストを明示移譲できる
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room } from "@tdd-mob/core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/** host（host-conn）＋ editor（editor-conn）をオンラインで持つテスト用ルーム */
function makeTestRoom(code: string): Room {
  return {
    code,
    createdAt: 1000000,
    hostParticipantId: "host-p01",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Host", "Editor"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["Host", "Editor"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0, 0],
      totalSwitches: 0,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "setup",
    participants: [
      {
        participantId: "host-p01",
        connId: "host-conn",
        displayName: "Host",
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000000,
      },
      {
        participantId: "editor-p02",
        connId: "editor-conn",
        displayName: "Editor",
        role: "editor",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000100,
      },
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

/**
 * @requirements v2.2 R2-3
 */
describe("handlers: host.transfer（明示的ホスト移譲）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let codeGen: FakeCodeGen;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    codeGen = new FakeCodeGen();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen });
    store.put(makeTestRoom("HX01"));
  });

  it("ホストはオンライン参加者へ移譲でき snapshot に反映される", async () => {
    // When
    const result = await handlers.handleCommand("host-conn", {
      command: "host.transfer",
      participantId: "editor-p02",
    });

    // Then
    result._unsafeUnwrap();

    const room = store.get("HX01");
    expect(room?.hostParticipantId).toBe("editor-p02");
    const newHost = room?.participants.find((p) => p.participantId === "editor-p02");
    const oldHost = room?.participants.find((p) => p.participantId === "host-p01");
    expect(newHost?.role).toBe("host");
    expect(oldHost?.role).toBe("editor");

    // 全員へ snapshot 配信
    expect(broadcaster.snapshots.some((s) => s.roomCode === "HX01")).toBe(true);
  });

  it("ホスト以外（editor）は UNAUTHORIZED で拒否され不変", async () => {
    // When
    const result = await handlers.handleCommand("editor-conn", {
      command: "host.transfer",
      participantId: "editor-p02",
    });

    // Then
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("UNAUTHORIZED");
    }
    expect(store.get("HX01")?.hostParticipantId).toBe("host-p01");
  });

  it("オフラインの対象へは PARTICIPANT_OFFLINE で拒否され不変", async () => {
    // Given
    const room = makeTestRoom("HX01");
    room.participants[1] = { ...room.participants[1]!, presence: "offline" };
    store.put(room);

    // When
    const result = await handlers.handleCommand("host-conn", {
      command: "host.transfer",
      participantId: "editor-p02",
    });

    // Then
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("PARTICIPANT_OFFLINE");
    }
    expect(store.get("HX01")?.hostParticipantId).toBe("host-p01");
  });

  it("自分自身への移譲は CANNOT_CHANGE_HOST で拒否され不変", async () => {
    // When
    const result = await handlers.handleCommand("host-conn", {
      command: "host.transfer",
      participantId: "host-p01",
    });

    // Then
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("CANNOT_CHANGE_HOST");
    }
    expect(store.get("HX01")?.hostParticipantId).toBe("host-p01");
  });

  it("不明な participantId は PARTICIPANT_NOT_FOUND で拒否され不変", async () => {
    // When
    const result = await handlers.handleCommand("host-conn", {
      command: "host.transfer",
      participantId: "unknown-pid",
    });

    // Then
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("PARTICIPANT_NOT_FOUND");
    }
    expect(store.get("HX01")?.hostParticipantId).toBe("host-p01");
  });

  // Phase 2a（ドライバー不在の自動繰上）との相互作用の回帰網。
  // 移譲は role と hostParticipantId のみを変え、rotation/currentIndex/driver 適格性は
  // 触らない（現ドライバー＝ホストを移譲してもドライバー進行が乱れない）。
  it("現ドライバー＝ホストを移譲しても rotation / currentIndex は不変", async () => {
    // Given（makeTestRoom は rotation ["Host","Editor"]・currentIndex 0＝現ドライバー=Host）

    // When
    const result = await handlers.handleCommand("host-conn", {
      command: "host.transfer",
      participantId: "editor-p02",
    });
    result._unsafeUnwrap();

    // Then（駆動の状態は一切変わらない）
    const room = store.get("HX01");
    expect(room?.session.rotation).toEqual(["Host", "Editor"]);
    expect(room?.session.currentIndex).toBe(0);
    // 旧ホストは editor になるが rotation には Host のまま残り、driver 適格性も不変。
    const oldHost = room?.participants.find((p) => p.participantId === "host-p01");
    expect(oldHost?.role).toBe("editor");
    expect(oldHost?.driverEligible).toBe(undefined);
  });
});
