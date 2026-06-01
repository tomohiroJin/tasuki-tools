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
import type { Room, Participant, SessionConfig, Problem } from "@tdd-mob/core";

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
  return {
    code: "AA0001",
    createdAt: 0,
    hostParticipantId: "host-1",
    config,
    problem,
    session: {
      rotation: ["Alice", "Carol"],
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
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "view-1", displayName: "Bob", role: "viewer", connId: "c2" }),
      makeParticipant({ participantId: "edit-1", displayName: "Carol", role: "editor", connId: "c3" }),
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    ...overrides,
  };
}

const noop = vi.fn();

function baseHandlers() {
  return {
    onSkip: noop,
    onPause: noop,
    onResume: noop,
    onComplete: noop,
    onReset: noop,
    onBreakStart: noop,
    onBreakEnd: noop,
    onRenameParticipant: vi.fn(),
    onDriverSkip: vi.fn(),
    onDriverResume: vi.fn(),
    onAddProxy: vi.fn(),
    onEditProblem: vi.fn(),
    onCopyProblem: vi.fn(),
    onRegenerateProblem: vi.fn(),
    onPasteProblem: vi.fn(),
  };
}

describe("Session × ProblemEditor 結合（項目3）", () => {
  it("problem があるとき ProblemEditor を描画しお題タイトル・要件を表示する（FR-009 接続）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    expect(screen.getByText("FizzBuzz")).toBeTruthy();
    expect(screen.getByText("3の倍数はFizz")).toBeTruthy();
    // ProblemEditor 由来の操作（コピー）が描画されている
    expect(screen.getByRole("button", { name: /コピー/ })).toBeTruthy();
  });

  it("editor+ がタイトルを編集すると onEditProblem が patch で発火する（FR-038/041）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /^編集$/ }));
    const titleInput = screen.getByLabelText("お題タイトル");
    fireEvent.change(titleInput, { target: { value: "改題FizzBuzz" } });
    fireEvent.blur(titleInput);
    expect(handlers.onEditProblem).toHaveBeenCalledWith({ title: "改題FizzBuzz" });
  });

  it("観覧者には編集ボタンが出ない（編集は editor+: FR-055）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="view-1" {...handlers} />);
    expect(screen.queryByRole("button", { name: /^編集$/ })).toBeNull();
  });
});
