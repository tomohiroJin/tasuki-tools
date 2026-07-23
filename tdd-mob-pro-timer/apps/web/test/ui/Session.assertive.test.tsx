/**
 * Session × 強い交代通知（assertiveSwitch・§9.1）のテスト
 *
 * config.assertiveSwitch が true のとき、交代の瞬間に全画面オーバーレイで
 * 新ドライバーを割り込み表示する。OFF のときは従来どおりソフト（オーバーレイ無し）。
 * prefers-reduced-motion 時は控えめ版（data 属性で区別）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1", connId: "c1", displayName: "Alice", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1000, ...overrides,
  };
}

function makeRoom(assertive: boolean, currentIndex: number): Room {
  const config: SessionConfig = {
    language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob"], intervalMinutes: 5,
    ...(assertive && { assertiveSwitch: true }),
  };
  return {
    code: "AA0001", createdAt: 0, hostParticipantId: "host-1", config, problem: null,
    session: { rotation: ["Alice", "Bob"], currentIndex, isPaused: false, driverCounts: [0, 0], totalSwitches: currentIndex },
    clock: { running: true, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: 0 },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
    sessionRecords: [], handoffNote: "", onBreak: false,
  };
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop, onPause: noop, onResume: noop, onComplete: noop, onAbort: noop,
    onReset: noop, onRenameParticipant: noop,
    onDriverSkip: noop, onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

describe("Session 強い交代通知（§9.1）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("assertiveSwitch ON で交代するとオーバーレイに新ドライバーが出る", () => {
    const { rerender } = render(
      <Session room={makeRoom(true, 0)} participantId="host-1" {...handlers()} />,
    );
    // 初期表示ではオーバーレイ無し
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // 交代（currentIndex 0→1, ドライバー Bob）
    rerender(<Session room={makeRoom(true, 1)} participantId="host-1" {...handlers()} />);
    const overlay = screen.getByRole("alertdialog", { name: /交代/ });
    expect(within(overlay).getByText(/Bob/)).toBeTruthy();
  });

  it("assertiveSwitch OFF では交代してもオーバーレイを出さない", () => {
    const { rerender } = render(
      <Session room={makeRoom(false, 0)} participantId="host-1" {...handlers()} />,
    );
    rerender(<Session room={makeRoom(false, 1)} participantId="host-1" {...handlers()} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("オーバーレイは約2.5秒で自動的に閉じる", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <Session room={makeRoom(true, 0)} participantId="host-1" {...handlers()} />,
      );
      rerender(<Session room={makeRoom(true, 1)} participantId="host-1" {...handlers()} />);
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
      act(() => { vi.advanceTimersByTime(2600); });
      expect(screen.queryByRole("alertdialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("表示中に再レンダリングされても自動消滅が妨げられない（レビュー #2）", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <Session room={makeRoom(true, 0)} participantId="host-1" {...handlers()} />,
      );
      rerender(<Session room={makeRoom(true, 1)} participantId="host-1" {...handlers()} />);
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
      // 表示中に再レンダリング（同じ index・別 props 相当）。タイマーは消えない。
      act(() => { vi.advanceTimersByTime(1000); });
      rerender(<Session room={makeRoom(true, 1)} participantId="host-1" {...handlers()} />);
      act(() => { vi.advanceTimersByTime(1700); });
      expect(screen.queryByRole("alertdialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers-reduced-motion 時は控えめ版（data-reduced-motion=true）になる", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const { rerender } = render(
      <Session room={makeRoom(true, 0)} participantId="host-1" {...handlers()} />,
    );
    rerender(<Session room={makeRoom(true, 1)} participantId="host-1" {...handlers()} />);
    const overlay = screen.getByRole("alertdialog", { name: /交代/ });
    expect(overlay.getAttribute("data-reduced-motion")).toBe("true");
  });
});
