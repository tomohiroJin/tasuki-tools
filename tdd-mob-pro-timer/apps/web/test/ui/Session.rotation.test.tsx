/**
 * Session 内の「ドライバーに加わる/外れる」自己トグル（UX 再設計 D1・2層モデル）
 * 途中参加者がセッション中でもローテーションに加入/離脱できる。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

const config: SessionConfig = {
  language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5,
};

/** rotation=[Alice]。Bob は editor だがローテーション未加入の途中参加者。 */
function makeRoom(): Room {
  return {
    code: "AA0001", createdAt: 0, hostParticipantId: "host-p", config, problem: null,
    session: { rotation: ["Alice"], currentIndex: 0, isPaused: false, driverCounts: [0], totalSwitches: 0 },
    clock: { running: true, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: 0 },
    phase: "session",
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "bob-p", displayName: "Bob", connId: "c2" }),
    ],
    sessionRecords: [], handoffNote: "", onBreak: false,
  };
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop, onPause: noop, onResume: noop, onComplete: noop, onAbort: noop,
    onReset: noop, onBreakStart: noop, onBreakEnd: noop, onRenameParticipant: noop,
    onDriverSkip: noop, onDriverResume: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

describe("Session ドライバー加入/離脱（D1）", () => {
  it("ローテーション未加入の自分には「ドライバーに加わる」が出る", () => {
    render(<Session room={makeRoom()} participantId="bob-p" {...handlers()} onJoinRotation={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ドライバーに加わる/ })).toBeTruthy();
  });

  it("「ドライバーに加わる」で onJoinRotation(自名) が呼ばれる", () => {
    const onJoinRotation = vi.fn();
    render(<Session room={makeRoom()} participantId="bob-p" {...handlers()} onJoinRotation={onJoinRotation} />);
    fireEvent.click(screen.getByRole("button", { name: /ドライバーに加わる/ }));
    expect(onJoinRotation).toHaveBeenCalledWith("Bob");
  });

  it("ローテーション加入済みの自分には「列から外れる」が出て自名で離脱する", () => {
    const onLeaveRotation = vi.fn();
    // 2人ローテーションにして「外れる」を有効化（最後の1人は外れられないため）。
    const room = makeRoom();
    room.session.rotation = ["Alice", "Bob"];
    room.session.driverCounts = [0, 0];
    render(<Session room={room} participantId="host-p" {...handlers()} onLeaveRotation={onLeaveRotation} />);
    fireEvent.click(screen.getByRole("button", { name: /列から外れる|外れる/ }));
    // index ではなく自名を渡す（レビュー #1）
    expect(onLeaveRotation).toHaveBeenCalledWith("Alice");
  });

  it("最後の1人のときは「列から外れる」が無効化される", () => {
    const onLeaveRotation = vi.fn();
    // makeRoom は rotation=[Alice] の単独。Alice 視点では外れられない。
    render(<Session room={makeRoom()} participantId="host-p" {...handlers()} onLeaveRotation={onLeaveRotation} />);
    const btn = screen.getByRole("button", { name: /列から外れる|外れる/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(onLeaveRotation).not.toHaveBeenCalled();
  });
});
