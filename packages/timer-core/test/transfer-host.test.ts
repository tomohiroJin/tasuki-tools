/**
 * transferHost 純粋変換のテスト（v2.2 R2-3）
 * 対象を host、現 host を editor に付け替え、hostParticipantId を更新する。
 */

import { describe, it, expect } from "vitest";
import { transferHost, type Room } from "../src/index.js";

/** テスト用の最小 Room を構築する（p1=host / p2=editor / p3=viewer）。 */
function makeRoom(): Room {
  return {
    code: "ROOM-1",
    createdAt: 0,
    hostParticipantId: "p1",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["A", "B", "C"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["A", "B", "C"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0, 0, 0],
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
    phase: "ready",
    participants: [
      {
        participantId: "p1",
        connId: "c1",
        displayName: "A",
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1,
      },
      {
        participantId: "p2",
        connId: "c2",
        displayName: "B",
        role: "editor",
        presence: "online",
        hasAiKey: false,
        joinedAt: 2,
      },
      {
        participantId: "p3",
        connId: "c3",
        displayName: "C",
        role: "viewer",
        presence: "online",
        hasAiKey: false,
        joinedAt: 3,
      },
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

/** participantId から role を引く小ヘルパー。 */
function roleOf(room: Room, id: string): string | undefined {
  return room.participants.find((p) => p.participantId === id)?.role;
}

describe("transferHost", () => {
  it("editor 対象へ移譲すると対象が host・現 host が editor になる", () => {
    // Given
    const room = makeRoom();
    // When
    const next = transferHost(room, "p2");
    // Then
    expect(next.hostParticipantId).toBe("p2");
    expect(roleOf(next, "p2")).toBe("host");
    expect(roleOf(next, "p1")).toBe("editor");
  });

  it("viewer 対象へ移譲すると対象が host・現 host が editor・他は不変", () => {
    // Given
    const room = makeRoom();
    // When
    const next = transferHost(room, "p3");
    // Then
    expect(next.hostParticipantId).toBe("p3");
    expect(roleOf(next, "p3")).toBe("host");
    expect(roleOf(next, "p1")).toBe("editor");
    // 移譲に無関係な p2 の role は変わらない
    expect(roleOf(next, "p2")).toBe("editor");
  });

  it("純粋変換であり元の room を破壊しない", () => {
    // Given
    const room = makeRoom();
    // When
    transferHost(room, "p2");
    // Then（room 自体は書き換わっていない）
    expect(room.hostParticipantId).toBe("p1");
    expect(roleOf(room, "p1")).toBe("host");
    expect(roleOf(room, "p2")).toBe("editor");
  });
});
