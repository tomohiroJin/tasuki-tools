/**
 * 主催者が不在のロビーで、残った人に何を見せるか（#76 J-3）。
 *
 * 開始は主催者限定（開始前は HOST_ONLY_BEFORE_START）なので、主催者がタブを閉じると
 * 誰も始められない。ホストの自動移譲は在席検出（heartbeat 15 秒 × 2）を待つため
 * 約 30〜40 秒かかり、その間ずっと「主催者のセッション開始を待っています...」と
 * 出ていた。**待っている相手がもう居ない**ことが分からず、壊れて見える。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Participant, Room } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

function participant(over: Partial<Participant> & Pick<Participant, "participantId">): Participant {
  return {
    connId: "conn",
    displayName: "だれか",
    role: "editor",
    presence: "online",
    hasAiKey: false,
    joinedAt: 1000000,
    ...over,
  };
}

/** 主催者と編集者が 1 人ずつ居るロビー。主催者の在席状況だけを差し替える。 */
function roomWithHostPresence(presence: Participant["presence"]): Room {
  return aRoomView({
    hostParticipantId: "host-p",
    participants: [
      participant({ participantId: "host-p", displayName: "アリス", role: "host", presence }),
      participant({ participantId: "me-p", displayName: "ボブ" }),
    ],
  });
}

describe("主催者不在のロビー（#76 J-3）", () => {
  it("主催者が居るときは、主催者の開始を待っていると出す", () => {
    // Given: 主催者が接続しているロビー
    // When: 主催者以外が見る
    render(<Lobby room={roomWithHostPresence("online")} participantId="me-p" onStartSession={vi.fn()} />);

    // Then: 従来どおりの案内
    expect(screen.getByText(/主催者のセッション開始を待っています/)).toBeInTheDocument();
  });

  it("主催者が居ないときは、不在と引き継ぎを伝える", () => {
    // Given: 主催者がタブを閉じたロビー
    // When: 主催者以外が見る
    render(<Lobby room={roomWithHostPresence("offline")} participantId="me-p" onStartSession={vi.fn()} />);

    // Then: 来ない相手を待たせない
    expect(screen.queryByText(/主催者のセッション開始を待っています/)).not.toBeInTheDocument();
    expect(screen.getByText(/まもなく主催者が引き継がれ/)).toBeInTheDocument();
  });
});
