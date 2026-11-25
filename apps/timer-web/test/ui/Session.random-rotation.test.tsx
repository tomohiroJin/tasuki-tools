/**
 * セッション画面のランダム交代の表示（#660）。
 *
 * 次に替わる人はサーバーが決めて `session.nextIndex` で配る（輪の順のモードと同じ項目）。画面は
 * その人を「次: 〈名前〉」に出し、モードの名前（「ランダム」）を添える。輪の並びは次に替わる順を
 * 表さないので、「あと N 人」は出さない。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

function p(participantId: string, displayName: string): Participant {
  return { participantId, displayName, presence: "online", joinedAt: 1 };
}

const memberNames = ["Alice", "Bob", "Carol"];

/** 輪は [Alice, Bob, Carol]・運転中は Alice。サーバーが決めた次の人は Carol（輪の隣の Bob ではない）。 */
function makeRoom(config: SessionConfig): Room {
  return aRoomView({
    code: "AA0001",
    config,
    memberNames,
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants: [p("a", "Alice"), p("b", "Bob"), p("c", "Carol")],
    session: { rotation: ["a", "b", "c"], currentIndex: 0, driverCounts: [0, 0, 0], nextIndex: 2 },
  });
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop, onStartBreak: noop, onEndBreak: noop, onAbort: noop,
    onReset: noop, onRenameParticipant: noop,
    onDriverSkip: noop, onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

describe("Session: ランダム交代の表示", () => {
  it("サーバーが決めた次の人を「次」に出し、モードの名前を添える", () => {
    const { container } = render(
      <Session room={makeRoom({ intervalMinutes: 5, rotationMode: "random" })} participantId="b" {...handlers()} />,
    );

    const next = container.querySelector(".session-next")!;
    expect(next.querySelector(".session-next-name")!.textContent).toBe("Carol");
    expect(next.querySelector(".session-next-mode")!.textContent).toBe("ランダム");
  });

  it("輪の並びから「あと N 人」を出さず、自分には順番がランダムだと伝える", () => {
    render(<Session room={makeRoom({ intervalMinutes: 5, rotationMode: "random" })} participantId="b" {...handlers()} />);

    expect(screen.getByText("あなた: 順番はランダムです")).toBeTruthy();
    expect(screen.queryByText(/あと\d+人/)).toBeNull();
  });

  it("輪の順のモードでは、モードの名前を出さない", () => {
    const { container } = render(<Session room={makeRoom({ intervalMinutes: 5 })} participantId="b" {...handlers()} />);

    expect(container.querySelector(".session-next-mode")).toBeNull();
    expect(screen.queryByText("あなた: 順番はランダムです")).toBeNull();
  });
});
