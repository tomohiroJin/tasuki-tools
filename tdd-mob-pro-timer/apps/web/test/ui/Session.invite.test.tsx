/**
 * Session × InvitePanel 結合テスト
 * v2.2 Epic1 #1: セッション開始後も「ルーム」タブから招待URLをコピーできる
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";
import { aRoomView } from "../support/room-view.js";

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
  members: ["Alice", "Carol"],
  intervalMinutes: 5,
};

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "ABC123",
    hostParticipantId: "host-1",
    config,
    session: { rotation: ["Alice", "Carol"], driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Carol", role: "editor", connId: "c3" }),
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

describe("Session × InvitePanel 結合（v2.2 #1）", () => {
  it("「ルーム」タブから参加URLをコピーできる (#1)", async () => {
    const user = userEvent.setup();
    // user-event v14 は setup() 時に navigator.clipboard を独自 stub に差し替えるため、
    // setup() 後に spyOn で writeText を差し込む
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<Session room={makeRoom()} participantId="host-1" {...baseHandlers()} />);
    await user.click(screen.getByRole("tab", { name: "ルーム" }));
    await user.click(screen.getByRole("button", { name: /参加 URL/ }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}?room=ABC123`);
  });

  it("デフォルトは「セッション」タブが表示される", () => {
    render(<Session room={makeRoom()} participantId="host-1" {...baseHandlers()} />);
    // タイマーが「セッション」タブのデフォルト表示として存在する
    expect(screen.getByRole("timer")).toBeTruthy();
  });

  it("「ルーム」タブにルームコード ABC123 が表示される", async () => {
    const user = userEvent.setup();
    render(<Session room={makeRoom()} participantId="host-1" {...baseHandlers()} />);
    await user.click(screen.getByRole("tab", { name: "ルーム" }));
    expect(screen.getByText("ABC123")).toBeTruthy();
  });
});
