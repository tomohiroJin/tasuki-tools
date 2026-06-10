/**
 * hostChangeMessage（ホスト交代通知メッセージ算出）の純粋関数テスト（v2.2 R2-4）。
 *
 * snapshot に常に載る hostParticipantId の「直前値→現在値」変化から、
 * 明示移譲・自動委譲の双方を 1 経路で検知できることを検証する。
 */

import { describe, it, expect } from "vitest";
import { hostChangeMessage } from "../src/ui/host-change.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1",
    connId: "c1",
    displayName: "Alice",
    role: "editor",
    presence: "online",
    hasAiKey: false,
    joinedAt: 1000,
    ...overrides,
  };
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["アリス", "ボブ"],
  intervalMinutes: 5,
};

/** host=hostId、participants に p1（アリス）・p2（ボブ）を持つ最小 Room を構築する。 */
function room(hostId: string): Room {
  return {
    code: "AA0001",
    createdAt: 0,
    hostParticipantId: hostId,
    config,
    problem: null,
    session: {
      rotation: ["アリス", "ボブ"],
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
    phase: "session",
    participants: [
      makeParticipant({ participantId: "p1", displayName: "アリス" }),
      makeParticipant({ participantId: "p2", displayName: "ボブ", connId: "c2" }),
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

describe("hostChangeMessage", () => {
  it("初回（prev 未定義）は null", () => {
    expect(hostChangeMessage(undefined, room("p1"), "p2")).toBeNull();
  });
  it("変化なしは null", () => {
    expect(hostChangeMessage("p1", room("p1"), "p2")).toBeNull();
  });
  it("自分がホストになったら専用メッセージ", () => {
    expect(hostChangeMessage("p1", room("p2"), "p2")).toBe("あなたがホストになりました。");
  });
  it("他者がホストになったら名前入りメッセージ", () => {
    expect(hostChangeMessage("p1", room("p2"), "p1")).toBe("ホストが ボブ さんに移りました。");
  });
});
