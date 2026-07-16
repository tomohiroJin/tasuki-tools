/**
 * Session × 交代前カウントダウン予告音の配線テスト（Issue #2）
 *
 * useCountdownTick が実際に呼ばれ、タイマー状態と個人設定が正しく渡っていることを確認する。
 * フック自体の挙動（何秒で鳴るか等）は use-countdown-tick.test.ts で検証済みのため、
 * ここでは「Session が正しい引数でフックを呼んでいるか」の配線のみを見る。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

vi.mock("../../src/ui/use-countdown-tick.js", () => ({ useCountdownTick: vi.fn() }));

import { useCountdownTick } from "../../src/ui/use-countdown-tick.js";
import { Session } from "../../src/ui/Session.js";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1", connId: "c1", displayName: "Alice", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1000, ...overrides,
  };
}

function makeRoom(running: boolean, isPaused: boolean): Room {
  const config: SessionConfig = {
    language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob"], intervalMinutes: 5,
  };
  return {
    code: "AA0001", createdAt: 0, hostParticipantId: "host-1", config, problem: null,
    session: { rotation: ["Alice", "Bob"], currentIndex: 0, isPaused, driverCounts: [0, 0], totalSwitches: 0 },
    clock: { running, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: running ? 0 : null },
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
    onDriverSkip: noop, onDriverResume: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

describe("Session × カウントダウン予告音の配線（Issue #2）", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("個人設定とタイマー走行状態をフックに渡す", () => {
    localStorage.setItem(
      "tdd-mob:notify:v1",
      JSON.stringify({
        enabled: false, soundId: "department", osNotify: true, volume: 0.6,
        countdownEnabled: true, countdownSeconds: 10,
      }),
    );
    render(<Session room={makeRoom(true, false)} participantId="host-1" {...handlers()} />);
    expect(useCountdownTick).toHaveBeenCalledWith(
      expect.any(Number),
      true,
      { enabled: true, thresholdSeconds: 10, volume: 0.6, mode: "tone", voiceId: "voice-male" },
    );
  });

  it("一時停止中(running=false)を渡す", () => {
    render(<Session room={makeRoom(false, true)} participantId="host-1" {...handlers()} />);
    expect(useCountdownTick).toHaveBeenCalledWith(expect.any(Number), false, expect.anything());
  });

  it("個人設定 OFF（既定）のとき enabled=false を渡す", () => {
    render(<Session room={makeRoom(true, false)} participantId="host-1" {...handlers()} />);
    expect(useCountdownTick).toHaveBeenCalledWith(
      expect.any(Number),
      true,
      expect.objectContaining({ enabled: false }),
    );
  });
});
