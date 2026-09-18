/**
 * 輪に席はあるが timer の画面に居ない人の見え方（#95 S5c）。
 *
 * S5a で `participants` が timer の在席者に絞られたため、選択画面へ戻った人の名前は
 * `participants` から引けない。画面はサーバーが用意した `config.members`
 * （rotation と同じ順の表示名）を渡すことでその席を埋める。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Participant, Room, Seat } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

const INVITE_URL_FOR_TEST = "https://tasuki.example/?room=TEST";

function p(participantId: string, displayName: string): Participant {
  return { participantId, displayName, presence: "online", hasAiKey: false, joinedAt: 1 };
}

const noop = () => {};
const handlers = {
  onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop,
  onAbort: noop, onReset: noop, onRenameParticipant: noop, onDriverSkip: noop,
  onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
};

/**
 * rotation=[あや, ゆう]。`present` が偽なら「ゆう」は選択画面へ戻っている。
 *
 * 席（`skipReason`）はサーバーが組むため、`aRoomView` の既定は輪から機械的に
 * 導くだけで在席かどうかを推測しない（#276）。この Given で「ゆう」を離席させたい
 * ときは、`session.seats` を丸ごと渡してサーバーの決定を模す。
 */
function makeRoom(options: { present: boolean }): Room {
  const participants = options.present
    ? [p("aya-p", "あや"), p("yuu-p", "ゆう")]
    : [p("aya-p", "あや")];
  const seats: Seat[] = [
    { id: "aya-p", displayName: "あや", isProxy: false, skipReason: null },
    { id: "yuu-p", displayName: "ゆう", isProxy: false, skipReason: options.present ? null : "away" },
  ];
  return aRoomView({
    code: "AA0001",
    config: { members: ["あや", "ゆう"] },
    session: { rotation: ["aya-p", "yuu-p"], currentIndex: 0, driverCounts: [0, 0], seats },
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants,
  });
}

describe("Session 輪に席が残る離席者", () => {
  it("timer を離れた人の名前を出し、その席が別の画面だと示す", () => {
    // Given（「ゆう」は選択画面へ戻り、participants から消えている）
    const room = makeRoom({ present: false });

    // When
    render(
      <Session inviteUrl={INVITE_URL_FOR_TEST} room={room} participantId="aya-p" {...handlers} />,
    );

    // Then（名前なしの空枠にならず、番が回らない理由が読める）
    expect(screen.getAllByText("ゆう").length).toBeGreaterThan(0);
    expect(screen.getByText("別の画面")).toBeTruthy();
  });

  it("timer に居る人には「別の画面」を出さない（対照）", () => {
    // Given（同じ輪で「ゆう」が timer に居るだけの違い）
    const room = makeRoom({ present: true });

    // When
    render(
      <Session inviteUrl={INVITE_URL_FOR_TEST} room={room} participantId="aya-p" {...handlers} />,
    );

    // Then
    expect(screen.getAllByText("ゆう").length).toBeGreaterThan(0);
    expect(screen.queryByText("別の画面")).toBeNull();
  });
});
