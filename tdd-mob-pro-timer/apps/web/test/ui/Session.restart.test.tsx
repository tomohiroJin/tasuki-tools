/**
 * Session「時間リセット」（現ドライバーのまま持ち時間をやり直す・Issue #14）
 *
 * 現ドライバーのまま持ち時間だけを満タンから走り直す操作が編集者ゾーンに出て、
 * onRestartTimer を発火すること。ホスト専用の全体リセット「最初から」と UI 上で
 * 明確に区別されること（別ボタン・別ゾーン）。閲覧者には出さないこと。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
  members: ["Alice", "Bob"],
  intervalMinutes: 5,
};

/** 走行中（Bob が現ドライバー）のルーム。overrides で一時停止等に変えられる。 */
function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-1",
    config,
    session: { rotation: ["Alice", "Bob"], currentIndex: 1, driverCounts: [1, 0], totalSwitches: 1 },
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Bob", role: "editor", connId: "c2" }),
      makeParticipant({ participantId: "view-1", displayName: "Carol", role: "viewer", connId: "c3" }),
    ],
    ...overrides,
  });
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop,
    onPause: noop,
    onResume: noop,
    onRestartTimer: noop,
    onComplete: noop,
    onAbort: noop,
    onReset: noop,
    onRenameParticipant: noop,
    onDriverSkip: noop,
    onDriverResume: noop,
    onDriverAssign: noop,
    onAddProxy: noop,
  };
}

/**
 * @requirements Issue #14
 */
describe("Session 持ち時間のやり直し", () => {
  it("編集者には「時間リセット」ボタンが出て、押すと持ち時間がリセットされる", () => {
    // Given
    const onRestartTimer = vi.fn();
    render(
      <Session room={makeRoom()} participantId="edit-1" {...handlers()} onRestartTimer={onRestartTimer} />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /時間リセット/ }));
    // Then
    expect(onRestartTimer).toHaveBeenCalledTimes(1);
  });

  it("一時停止中でも押せる（押すと走行再開する操作なので無効化しない）", () => {
    // Given
    const onRestartTimer = vi.fn();
    const room = makeRoom({
      session: { ...makeRoom().session, isPaused: true },
      clock: { ...makeRoom().clock, running: false, runningSince: null },
    });
    render(
      <Session room={room} participantId="edit-1" {...handlers()} onRestartTimer={onRestartTimer} />,
    );
    const btn = screen.getByRole("button", { name: /時間リセット/ }) as HTMLButtonElement;
    // Then（無効化されていない）
    expect(btn.disabled).toBe(false);
    // When
    fireEvent.click(btn);
    // Then
    expect(onRestartTimer).toHaveBeenCalledTimes(1);
  });

  it("閲覧者（viewer）には表示しない", () => {
    render(<Session room={makeRoom()} participantId="view-1" {...handlers()} />);
    expect(screen.queryByRole("button", { name: /時間リセット/ })).toBeNull();
  });

  it("ホスト専用の「最初から」（全体リセット）とは別のボタンであり、独立して発火する", () => {
    // Given
    const onRestartTimer = vi.fn();
    const onReset = vi.fn();
    render(
      <Session
        room={makeRoom()}
        participantId="host-1"
        {...handlers()}
        onRestartTimer={onRestartTimer}
        onReset={onReset}
      />,
    );
    const restartBtn = screen.getByRole("button", { name: /時間リセット/ });
    // 「最初から」は終了系の隔離ゾーン（確認ダイアログつき）にあり、別ボタンとして共存する。
    const endZone = screen.getByLabelText("セッションを終える");
    const resetBtn = within(endZone).getByRole("button", { name: /最初から/ });
    // Then（別のボタンである）
    expect(restartBtn).not.toBe(resetBtn);
    // When（やり直しは確認ダイアログなしで即発火する）
    fireEvent.click(restartBtn);
    // Then（全体リセットは呼ばれない）
    expect(onRestartTimer).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
    // When（全体リセットは確認を経てから発火する。誤操作防止の導線差）
    fireEvent.click(resetBtn);
    // Then（確認前は発火しない）
    expect(onReset).not.toHaveBeenCalled();
    // When（確認する）
    fireEvent.click(screen.getByRole("button", { name: /最初から再スタート/ }));
    // Then
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("やり直しボタンは終了系の隔離ゾーンの外（タイマー操作ゾーン）にある", () => {
    render(<Session room={makeRoom()} participantId="host-1" {...handlers()} />);
    const endZone = screen.getByLabelText("セッションを終える");
    const restartBtn = screen.getByRole("button", { name: /時間リセット/ });
    expect(endZone.contains(restartBtn)).toBe(false);
    // スキップ・一時停止と同じ操作行に並ぶ。
    const row = restartBtn.parentElement!;
    expect(row.textContent).toMatch(/スキップ/);
    expect(row.textContent).toMatch(/一時停止/);
  });
});
