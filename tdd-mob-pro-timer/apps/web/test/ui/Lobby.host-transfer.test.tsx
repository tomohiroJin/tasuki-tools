/**
 * Lobby「ホストを譲る」明示移譲のテスト（v2.2 R2-3）
 * 主催者は離脱前に、任意のオンライン参加者へホストを明示移譲できる。
 * Session だけでなく Lobby（開始前の待機画面）でも移譲できることを担保する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room, Participant } from "@tdd-mob/core";
import { aRoomView } from "../support/room-view.js";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

/** host=Alice, 別参加者=Bob(editor・online) の部屋 */
function makeRoom(): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5 },
    session: { rotation: ["Alice"] },
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "p2", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
  });
}

const noop = vi.fn();

/**
 * @requirements R2-3
 */
describe("Lobby ホスト移譲", () => {
  it("ホストはロビーでオンライン参加者に『ホストを譲る』を出し、押すとホスト移譲の要求が送られる", async () => {
    // Given
    const onTransferHost = vi.fn();
    render(
      <Lobby room={makeRoom()} participantId="host-p" onStartSession={noop} onTransferHost={onTransferHost} />,
    );
    // When
    await userEvent.click(screen.getByRole("button", { name: /ホストを譲る/ }));
    // Then
    expect(onTransferHost).toHaveBeenCalledWith("p2");
  });

  it("オフライン参加者には『ホストを譲る』を出さない", () => {
    // Given
    const onTransferHost = vi.fn();
    const room = makeRoom();
    room.participants[1] = p({ participantId: "p2", displayName: "Bob", role: "editor", connId: "c2", presence: "offline" });
    // When
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onTransferHost={onTransferHost} />,
    );
    // Then
    expect(screen.queryByRole("button", { name: /ホストを譲る/ })).toBeNull();
  });

  it("ホストでない参加者にはボタンが出ない", () => {
    // Given（自分=Bob(editor) 視点）
    const onTransferHost = vi.fn();
    // When
    render(
      <Lobby room={makeRoom()} participantId="p2" onStartSession={noop} onTransferHost={onTransferHost} />,
    );
    // Then
    expect(screen.queryByRole("button", { name: /ホストを譲る/ })).toBeNull();
  });
});
