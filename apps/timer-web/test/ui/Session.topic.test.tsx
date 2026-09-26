/**
 * Session はいまのお題を出す（#91）。**読むだけ**で、編集はお題ツールの仕事（spec T4）。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

/** 参加用 URL は同期フックが組み立てる（#95 S5b）。画面へは値として渡す。 */
const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1",
    displayName: "Alice",
    presence: "online",
    joinedAt: 1000,
    ...overrides,
  };
}

const config: SessionConfig = {
  intervalMinutes: 5,
};

/** 席に付ける表示名（輪と同じ順）。wire の項目ではない（#294・造作だけの入口）。 */
const memberNames = ["Alice", "Carol"];

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "ABC123",
    config,
    memberNames,
    session: { rotation: ["Alice", "Carol"], driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "p-alice", displayName: "Alice" }),
      makeParticipant({ participantId: "p-carol", displayName: "Carol" }),
    ],
    ...overrides,
  });
}

const noop = vi.fn();

function baseHandlers() {
  return {
    onSkip: noop,
    onPause: noop,
    onResume: noop,
    onRestartTimer: noop,
    onComplete: noop,
    onAbort: noop,
    onReset: noop,
    onRenameParticipant: vi.fn(),
    onDriverSkip: vi.fn(),
    onDriverResume: vi.fn(),
    onDriverAssign: vi.fn(),
    onAddProxy: vi.fn(),
  };
}

/**
 * @requirements #91 E15 E16
 */
describe("Session のお題の札", () => {
  it("Given お題がある / When セッションを描く / Then お題の札が出る", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "", source: "manual" as const };
    // When
    render(
      <Session
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="p-alice"
        {...baseHandlers()}
        topic={topic}
      />,
    );
    // Then
    expect(screen.getByRole("region", { name: "お題" })).toBeInTheDocument();
  });

  it("Given お題が無い / When セッションを描く / Then お題の札は出ない", () => {
    // Given: 既定のルーム（お題なし）
    // When: 描く
    render(
      <Session
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="p-alice"
        {...baseHandlers()}
        topic={null}
      />,
    );
    // Then
    expect(screen.queryByRole("region", { name: "お題" })).toBeNull();
  });
});
