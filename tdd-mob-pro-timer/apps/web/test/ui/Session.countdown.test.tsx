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
import type { Room, Participant } from "@tdd-mob/core";
import { aRoomView } from "../support/room-view.js";

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
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-1",
    config: { members: ["Alice", "Bob"], intervalMinutes: 5 },
    session: { rotation: ["Alice", "Bob"], isPaused, driverCounts: [0, 0] },
    clock: { running, runningSince: running ? 0 : null },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Bob", role: "editor", connId: "c2" }),
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
 * @requirements Issue #2
 */
describe("Session × カウントダウン予告音の配線", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("個人設定とタイマー走行状態をフックに渡す", () => {
    // Given
    localStorage.setItem(
      "tdd-mob:notify:v1",
      JSON.stringify({
        enabled: false, soundId: "department", osNotify: true, volume: 0.6,
        countdownEnabled: true, countdownSeconds: 10,
      }),
    );
    // When
    render(<Session room={makeRoom(true, false)} participantId="host-1" {...handlers()} />);
    // Then
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
    // Given（running=true・isPaused=false の部屋）
    const room = makeRoom(true, false);
    // When
    render(<Session room={room} participantId="host-1" {...handlers()} />);
    // Then
    expect(useCountdownTick).toHaveBeenCalledWith(
      expect.any(Number),
      true,
      expect.objectContaining({ enabled: false }),
    );
  });
});
