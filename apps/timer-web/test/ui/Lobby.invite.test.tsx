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
import type { Room } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    createdAt: 1000000,
    memberNames: ["Alice"],
    config: { intervalMinutes: 5 },
    // rotation は参加者IDの配列（D6b）。表示名 "Alice" を rotation に置くと、席の造作
    // （seatsFrom）が id: "Alice" の別席を生み、実在の "creator-p" と同名の別人に見える
    // （#276 で Lobby が席も同名判定に使うようになり、この取り違えが表面化した）。
    session: { rotation: ["creator-p"] },
    participants: [
      {
        participantId: "creator-p",
        displayName: "Alice",
        presence: "online",
        joinedAt: 1000000,
      },
    ],
    ...overrides,
  });
}

/**
 * @requirements T058, T059, FR-004, FR-005, FR-006, FR-008, FR-026, FR-033,
 * FR-034, FR-052, FR-060, US2, US6, US8, R1-4
 */
describe("Lobby の脇と開始", () => {
  const noop = vi.fn();

  it("招待（ルームコード・コピー）は脇に出さない（共通の見出しが持つ）", () => {
    // Given / When
    render(<Lobby room={makeRoom()} participantId="creator-p" onStartSession={noop} />);
    // Then
    expect(screen.queryByText("TEST01")).toBeNull();
    expect(screen.queryByRole("button", { name: /コピー/ })).toBeNull();
  });

  it("参加者一覧が表示される", () => {
    // Given
    // When
    render(
      <Lobby
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={noop}
      />,
    );
    // Then
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("セッション開始ボタンが表示される", () => {
    // Given
    // When
    render(
      <Lobby
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={noop}
      />,
    );
    // Then
    expect(screen.getByRole("button", { name: /開始|start/i })).toBeTruthy();
  });

  it("設定タブを開かなくても（既定のまま）開始できる", async () => {
    // Given（既定のルーム。#91 PR 3 でお題は timer の snapshot から消えた）
    const roomWithProblem = makeRoom({});
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <Lobby
        room={roomWithProblem}
        participantId="creator-p"
        onStartSession={onStart}
      />,
    );
    // When（既定の「ルーム」タブのまま。お題・設定タブはクリックしない）
    await user.click(screen.getByRole("button", { name: /セッションを開始/ }));
    // Then
    expect(onStart).toHaveBeenCalled();
  });
});
