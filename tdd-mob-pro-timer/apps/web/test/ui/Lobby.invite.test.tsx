/**
 * Lobby 招待 1 操作テスト
 * T058/T059: FR-004,005,006,008,026,033,034,060 (US2,6,8)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
// Note: Lobby の onStart prop は onStartSession として定義されている
import type { Room } from "@tdd-mob/core";

function makeRoom(overrides?: Partial<Room>): Room {
  return {
    code: "TEST01",
    createdAt: 1000000,
    hostParticipantId: "host-p",
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: ["Alice"],
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: ["Alice"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0],
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
    phase: "setup",
    participants: [
      {
        participantId: "host-p",
        connId: "conn1",
        displayName: "Alice",
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 1000000,
      },
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    ...overrides,
  };
}

describe("Lobby 招待 1 操作（T058/T059）", () => {
  const noop = vi.fn();

  it("ルームコードが表示される（FR-004）", () => {
    render(
      <Lobby
        room={makeRoom()}
        participantId="host-p"
        onStartSession={noop}
      />,
    );
    expect(screen.getByText(/TEST01/)).toBeTruthy();
  });

  it("コピーボタンが存在する（FR-033: 1 操作で招待）", () => {
    render(
      <Lobby
        room={makeRoom()}
        participantId="host-p"
        onStartSession={noop}
      />,
    );
    // ルームコードコピー or 参加URLコピーが少なくとも1つある
    expect(screen.getAllByRole("button", { name: /コピー|copy/i }).length).toBeGreaterThan(0);
  });

  it("参加者一覧が表示される（FR-008/052）", () => {
    render(
      <Lobby
        room={makeRoom()}
        participantId="host-p"
        onStartSession={noop}
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("host にはセッション開始ボタンが表示される（FR-008）", () => {
    render(
      <Lobby
        room={makeRoom()}
        participantId="host-p"
        onStartSession={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /開始|start/i })).toBeTruthy();
  });
});
