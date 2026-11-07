/**
 * 「ランダム」ボタンの出し分け（Session の名簿・#553）。2 人以上のときだけ出る。
 * 規則は ShuffleButton の 1 か所にあり、ロビー（Lobby.rotation.test.tsx）と名簿が同じ規則を使う。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

const p = (o: Partial<Participant>): Participant => ({ participantId: "x", displayName: "X", presence: "online", joinedAt: 1, ...o });
const noop = () => {};
const handlers = () => ({
  onSkip: noop, onPause: noop, onResume: noop, onRestartTimer: noop, onComplete: noop, onStartBreak: noop, onEndBreak: noop, onAbort: noop,
  onReset: noop, onRenameParticipant: noop,
  onDriverSkip: noop, onDriverResume: noop, onDriverAssign: noop, onAddProxy: noop, onHandoffNoteSet: noop,
});

function makeRoom(rotation: string[]): Room {
  const room = aRoomView({
    code: "AA0001",
    config: { intervalMinutes: 5 },
    memberNames: ["Alice"],
    clock: { running: true, runningSince: 0 },
    phase: "session",
    participants: [p({ participantId: "creator-p", displayName: "Alice" }), p({ participantId: "bob-p", displayName: "Bob" })],
  });
  room.session.rotation = rotation;
  room.session.driverCounts = rotation.map(() => 0);
  return room;
}

const shuffleButtons = () => screen.queryAllByRole("button", { name: "ドライバー順をランダムに並べ替える" });

describe("Session の名簿の「ランダム」", () => {
  it("輪が 1 人なら出ない（セッションのタブ・ルームのタブとも）", () => {
    render(<Session room={makeRoom(["creator-p"])} participantId="creator-p" {...handlers()} onShuffle={vi.fn()} />);
    expect(shuffleButtons()).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: "ルーム" }));
    expect(shuffleButtons()).toHaveLength(0);
  });

  it("輪が 2 人なら出て、押すと onShuffle が呼ばれる（セッションのタブ・ルームのタブとも）", () => {
    const onShuffle = vi.fn();
    render(<Session room={makeRoom(["creator-p", "bob-p"])} participantId="creator-p" {...handlers()} onShuffle={onShuffle} />);
    expect(shuffleButtons()).toHaveLength(1);
    fireEvent.click(shuffleButtons()[0]!);
    expect(onShuffle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "ルーム" }));
    expect(shuffleButtons()).toHaveLength(1);
  });

  it("onShuffle を渡さなければ、2 人でも出ない", () => {
    render(<Session room={makeRoom(["creator-p", "bob-p"])} participantId="creator-p" {...handlers()} />);
    expect(shuffleButtons()).toHaveLength(0);
  });
});
