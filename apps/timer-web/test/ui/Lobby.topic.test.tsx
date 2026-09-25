/**
 * Lobby はいまのお題を出す（#91）。**読むだけ**で、編集はお題ツールの仕事（spec T4）。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

/** 参加用 URL は同期フックが組み立てる（#95 S5b）。画面へは値として渡す。 */
const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    createdAt: 1000000,
    memberNames: ["Alice"],
    config: { intervalMinutes: 5 },
    session: { rotation: ["Alice"] },
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

const noop = vi.fn();

/**
 * @requirements #91 E15 E16
 */
describe("Lobby のお題の札", () => {
  it("Given お題がある / When ロビーを描く / Then お題の札が出る", () => {
    // Given
    const topic = { title: "FizzBuzz", body: "", source: "manual" as const };
    // When
    render(
      <Lobby
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={noop}
        topic={topic}
      />,
    );
    // Then
    expect(screen.getByRole("region", { name: "お題" })).toBeInTheDocument();
  });

  it("Given お題が無い / When ロビーを描く / Then お題の札は出ない", () => {
    // Given / When
    render(
      <Lobby
        inviteUrl={INVITE_URL_FOR_TEST}
        room={makeRoom()}
        participantId="creator-p"
        onStartSession={noop}
        topic={null}
      />,
    );
    // Then
    expect(screen.queryByRole("region", { name: "お題" })).toBeNull();
  });
});
