/**
 * Session の「ルーム」タブ
 * 招待は共通の見出し（App.tsx の RoomHeader・#447 段 2）へ移った。ここにはパスフレーズ等が残る
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

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
    onComplete: noop, onStartBreak: noop, onEndBreak: noop,
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
 * @requirements v2.2 Epic1 #1
 */
describe("Session の「ルーム」タブ（招待は共通の見出しへ移った）", () => {
  it("デフォルトは「セッション」タブが表示される", () => {
    // Given
    render(<Session room={makeRoom()} participantId="p-alice" {...baseHandlers()} />);
    // Then（タイマーが「セッション」タブのデフォルト表示として存在する）
    expect(screen.getByRole("timer")).toBeTruthy();
  });

  it("「ルーム」タブに招待（ルームコードのコピー・参加 URL のコピー）は無い", async () => {
    // Given
    const user = userEvent.setup();
    render(<Session room={makeRoom()} participantId="p-alice" {...baseHandlers()} />);
    // When
    await user.click(screen.getByRole("tab", { name: "ルーム" }));
    // Then
    expect(screen.queryByRole("button", { name: /参加 URL/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "ルームコードをコピー" })).toBeNull();
    expect(screen.queryByText("ABC123")).toBeNull();
  });

  it("「ルーム」タブにパスフレーズの設定は残る", async () => {
    // Given
    const user = userEvent.setup();
    render(<Session room={makeRoom()} participantId="p-alice" {...baseHandlers()} onSetPassphrase={vi.fn()} />);
    // When
    await user.click(screen.getByRole("tab", { name: "ルーム" }));
    // Then
    expect(screen.getByText(/パスフレーズ/, { selector: "*" })).toBeTruthy();
  });
});
