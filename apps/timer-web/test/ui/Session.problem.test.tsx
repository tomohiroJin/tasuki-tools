/**
 * Session × ProblemEditor 結合テスト
 * 項目3: FR-009/038/040/041（US3）
 *
 * Session が独自の簡易お題表示ではなく ProblemEditor を描画し、
 * editor+ のフィールド編集が onEditProblem（= problem.edit）を patch 付きで発火すること、
 * 観覧者には編集導線が出ないことを検証する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig, Problem } from "@tasuki/timer-core";
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

const problem: Problem = {
  title: "FizzBuzz",
  description: "3の倍数でFizz",
  requirements: ["3の倍数はFizz", "5の倍数はBuzz"],
  exampleTest: "expect(fizzbuzz(3)).toBe('Fizz')",
  hints: ["剰余を使う"],
  source: "fallback",
  edited: false,
};

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-1",
    config,
    problem,
    session: { rotation: ["Alice", "Carol"], driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "view-1", displayName: "Bob", role: "viewer", connId: "c2" }),
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
    onEditProblem: vi.fn(),
    onCopyProblem: vi.fn(),
    onRegenerateProblem: vi.fn(),
    onPasteProblem: vi.fn(),
  };
}

/**
 * @requirements FR-009, FR-038, FR-040, FR-041, FR-055, US3
 */
describe("Session × ProblemEditor 結合", () => {
  it("problem があるとき ProblemEditor を描画しお題タイトル・要件を表示する", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Then（セッション中は折りたたみバー。タイトルはバーに常時表示）
    expect(screen.getByText("FizzBuzz")).toBeTruthy();
    // When（バーを開く → フルカード）
    fireEvent.click(screen.getByRole("button", { name: /詳細を開く/ }));
    // Then（コピー導線が出る）
    expect(screen.getByRole("button", { name: /コピー/ })).toBeTruthy();
    // When（「詳細を表示」で要件を確認する）
    fireEvent.click(screen.getByRole("button", { name: /詳細を表示/ }));
    // Then
    expect(screen.getByText("3の倍数はFizz")).toBeTruthy();
  });

  it("editor+ がタイトルを編集すると onEditProblem が patch で発火する", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // When（折りたたみバーを開いてから編集に入る）
    fireEvent.click(screen.getByRole("button", { name: /詳細を開く/ }));
    fireEvent.click(screen.getByRole("button", { name: /内容を編集/ }));
    const titleInput = screen.getByLabelText("お題タイトル");
    fireEvent.change(titleInput, { target: { value: "改題FizzBuzz" } });
    fireEvent.blur(titleInput);
    // Then
    expect(handlers.onEditProblem).toHaveBeenCalledWith({ title: "改題FizzBuzz" });
  });

  it("観覧者には編集ボタンが出ない（編集は editor+ 限定）", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="view-1" {...handlers} />);
    // When（バーを開いてもフルカードに編集ボタンは無い）
    fireEvent.click(screen.getByRole("button", { name: /詳細を開く/ }));
    // Then
    expect(screen.queryByRole("button", { name: /内容を編集/ })).toBeNull();
  });
});
