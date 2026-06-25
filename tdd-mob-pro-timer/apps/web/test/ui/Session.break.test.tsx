/**
 * Session × 休憩 UI 撤去確認テスト（§9.1 削除後）
 *
 * 休憩ボタン・休憩中バナーは v2.10 で撤去済み。
 * このテストはそれらが画面に存在しないことを検証する。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1", connId: "c1", displayName: "Alice", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1000, ...overrides,
  };
}

const config: SessionConfig = {
  language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob"], intervalMinutes: 5,
};

function makeRoom(onBreak: boolean): Room {
  return {
    code: "AA0001", createdAt: 0, hostParticipantId: "host-1", config, problem: null,
    session: { rotation: ["Alice", "Bob"], currentIndex: 0, isPaused: false, driverCounts: [0, 0], totalSwitches: 0 },
    clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    phase: "session",
    participants: [makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" })],
    sessionRecords: [], handoffNote: "", onBreak,
  };
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop, onPause: noop, onResume: noop, onComplete: noop, onAbort: noop,
    onReset: noop, onRenameParticipant: noop,
    onDriverSkip: noop, onDriverResume: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

describe("Session 休憩UI撤去確認（§9.1 削除後）", () => {
  it("休憩ボタンが存在しない", () => {
    render(<Session room={makeRoom(false)} participantId="host-1" {...handlers()} />);
    expect(screen.queryByRole("button", { name: /休憩/ })).toBeNull();
  });

  it("onBreak=true でも『休憩中』バナーが表示されない", () => {
    render(<Session room={makeRoom(true)} participantId="host-1" {...handlers()} />);
    expect(screen.queryByText(/休憩中/)).toBeNull();
  });
});
