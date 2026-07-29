/**
 * Session 内の「ドライバーに加わる/外れる」自己トグル（UX 再設計 D1・2層モデル）
 * 途中参加者がセッション中でもローテーションに加入/離脱できる。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";
import { aRoomView } from "../support/room-view.js";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

const config: SessionConfig = {
  language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5,
};

/** rotation=[Alice(host-p)]。rotation は参加者IDの配列（D6b）。
 *  Bob は editor だがローテーション未加入の途中参加者。 */
function makeRoom(): Room {
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-p",
    config,
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "bob-p", displayName: "Bob", connId: "c2" }),
    ],
  });
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop, onAbort: noop,
    onReset: noop, onRenameParticipant: noop,
    onDriverSkip: noop, onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

/**
 * @requirements D1, Issue #1, Issue #2
 */
describe("Session ドライバー加入/離脱", () => {
  it("ローテーション未加入の自分には「ドライバーに加わる」が出る", () => {
    render(<Session room={makeRoom()} participantId="bob-p" {...handlers()} onJoinRotation={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ドライバーに加わる/ })).toBeTruthy();
  });

  it("「ドライバーに加わる」を押すと自分がローテーションに加入する", () => {
    // Given
    const onJoinRotation = vi.fn();
    render(<Session room={makeRoom()} participantId="bob-p" {...handlers()} onJoinRotation={onJoinRotation} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /ドライバーに加わる/ }));
    // Then
    expect(onJoinRotation).toHaveBeenCalledWith("bob-p");
  });

  it("ローテーション加入済みの自分には「列から外れる」が出て自名で離脱する", () => {
    // Given（2人ローテーションにして「外れる」を有効化。最後の1人は外れられないため）
    const onLeaveRotation = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    render(<Session room={room} participantId="host-p" {...handlers()} onLeaveRotation={onLeaveRotation} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /列から外れる|外れる/ }));
    // Then（index ではなく自名を渡す）
    expect(onLeaveRotation).toHaveBeenCalledWith("host-p");
  });

  /** 自己操作トグル（「あなた:」を含む行）に限定する。RosterPanel 行にも同名ボタンが出るため。 */
  const selfToggle = () => screen.getByText(/あなた:/).closest("div") as HTMLElement;

  it("ドライバーの自分には「一時離脱」が出て、押すと自分が一時離脱する", () => {
    // Given（Alice(host-p) は rotation 加入・driverEligible 未設定＝稼働中）
    const onDriverSkip = vi.fn();
    render(<Session room={makeRoom()} participantId="host-p" {...handlers()} onDriverSkip={onDriverSkip} />);
    // When
    fireEvent.click(within(selfToggle()).getByRole("button", { name: /一時離脱/ }));
    // Then
    expect(onDriverSkip).toHaveBeenCalledWith("host-p");
  });

  it("離脱中の自分には「復帰」が出て、押すと自分が復帰する", () => {
    // Given（自分(host-p=Alice)を離脱中にする）
    const onDriverResume = vi.fn();
    const room = makeRoom();
    room.participants = room.participants.map((pp) =>
      pp.participantId === "host-p" ? { ...pp, driverEligible: false } : pp,
    );
    render(<Session room={room} participantId="host-p" {...handlers()} onDriverResume={onDriverResume} />);
    // When
    fireEvent.click(within(selfToggle()).getByRole("button", { name: /復帰/ }));
    // Then
    expect(onDriverResume).toHaveBeenCalledWith("host-p");
  });

  it("Session では自分の行に「一時離脱」を出さず自己トグルに集約する（重複解消）", () => {
    // Given
    render(<Session room={makeRoom()} participantId="host-p" {...handlers()} onDriverSkip={vi.fn()} />);
    // Then（自己トグルには一時離脱がある）
    expect(within(selfToggle()).getByRole("button", { name: /一時離脱/ })).toBeTruthy();
    // Then（自分(Alice)は rotation 内 → ドライバー一覧に表示される。
    // 自分の行には一時離脱を出さない。改名は残す）
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const aliceRow = within(driverList).getByText("Alice").closest("li") as HTMLElement;
    expect(within(aliceRow).queryByRole("button", { name: /一時離脱/ })).toBeNull();
    expect(within(aliceRow).getByRole("button", { name: /改名/ })).toBeTruthy();
  });

  it("最後の1人のときは「列から外れる」が無効化される", () => {
    // Given（makeRoom は rotation=[host-p] の単独。Alice 視点では外れられない）
    const onLeaveRotation = vi.fn();
    render(<Session room={makeRoom()} participantId="host-p" {...handlers()} onLeaveRotation={onLeaveRotation} />);
    const btn = screen.getByRole("button", { name: /列から外れる|外れる/ });
    // Then
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    // When
    fireEvent.click(btn);
    // Then
    expect(onLeaveRotation).not.toHaveBeenCalled();
  });
});
