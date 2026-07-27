/**
 * Lobby 招待 1 操作テスト
 * T058/T059: FR-004,005,006,008,026,033,034,060 (US2,6,8)
 * R1-4: お題・設定タブを開かなくても既定お題のまま開始できる
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("お題・設定タブを開かなくても（既定お題のまま）開始できる (R1-4)", async () => {
    // お題が確定済みの room を用意（既定お題のまま開始できるケース）
    const roomWithProblem = makeRoom({
      problem: {
        title: "FizzBuzz",
        description: "1から100までの整数を出力する",
        requirements: ["1から100まで出力する"],
        exampleTest: "expect(fizzBuzz(3)).toBe('Fizz')",
        hints: [],
        source: "fallback",
        edited: false,
      },
    });
    const user = userEvent.setup();
    const onStart = vi.fn();
    // host・room.problem 確定済みの room で Lobby を描画
    render(
      <Lobby
        room={roomWithProblem}
        participantId="host-p"
        onStartSession={onStart}
      />,
    );
    // 既定の「ルーム」タブのまま（お題・設定タブはクリックしない）
    await user.click(screen.getByRole("button", { name: /セッションを開始/ }));
    expect(onStart).toHaveBeenCalled();
  });
});
