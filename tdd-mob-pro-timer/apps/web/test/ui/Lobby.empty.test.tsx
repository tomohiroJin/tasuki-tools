/**
 * Lobby 空状態ヒントのテスト（v2.2 R5-2）
 * 参加者が自分1人のとき、招待を促す EmptyHint を出す。仲間が揃ったら出さない。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
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

describe("Lobby 空状態ヒント（R5-2）", () => {
  const noop = vi.fn();

  it("参加者が自分1人のとき招待を促すヒントを出す", () => {
    render(<Lobby room={makeRoom()} participantId="host-p" onStartSession={noop} />);
    expect(screen.getByText(/まだあなただけ/)).toBeInTheDocument();
  });

  it("参加者が2人以上ならヒントを出さない", () => {
    const room = makeRoom({
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
        {
          participantId: "editor-p",
          connId: "conn2",
          displayName: "Bob",
          role: "editor",
          presence: "online",
          hasAiKey: false,
          joinedAt: 1000001,
        },
      ],
    });
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    expect(screen.queryByText(/まだあなただけ/)).toBeNull();
  });
});
