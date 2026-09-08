/**
 * ロビーの自己退出導線（Issue #37）。
 *
 * セッション開始前のロビーには「ルームから抜ける」導線が無く、気が変わった参加者は
 * タブを閉じる（＝切断。オフラインとして残り続け、ローテーションの枠も残る）しかなかった。
 * サーバー側の participant.remove（自己対象）は既に正規経路として通るため、
 * ここではロビーの参加者一覧に導線を足すだけでよい（App.tsx 側の遷移は対象外）。
 *
 * 確認ダイアログは自己操作のため課さない（FR-079 の既存判断を踏襲）。
 * 他人を退出させるフロー（RemovalConfirmDialog 経由）とは別経路。
 *
 * @requirements FR-001, FR-002, FR-003, FR-004, FR-005
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room, Participant } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

/** Alice と自分=Bob の 2 名が在室する部屋。 */
function makeRoomWithTwoParticipants(): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5 },
    participants: [
      p({ participantId: "creator-p", displayName: "Alice" }),
      p({ participantId: "bob-p", displayName: "Bob", connId: "c2" }),
    ],
  });
}

const noop = vi.fn();

describe("ロビー: 自分の行の「ルームから抜ける」", () => {
  it("自分の行に「ルームから抜ける」ボタンが表示される", () => {
    // Given
    render(
      <Lobby
        room={makeRoomWithTwoParticipants()}
        participantId="bob-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    // When / Then（screen.getByRole への問い合わせが検証と同じ式になる）
    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });

  it("押すと確認ダイアログを経由せず自分が退出する", () => {
    // Given
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithTwoParticipants()}
        participantId="bob-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );
    // When
    screen.getByRole("button", { name: "ルームから抜ける" }).click();
    // Then
    expect(onRemoveParticipant).toHaveBeenCalledWith("bob-p");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("他に在室者が残っていても押せる", () => {
    // Given（かつては「編集者以上が1名以上残る」という不変条件で無効化していた。
    //        #95 S3 で役割が消え、その不変条件ごと無くなった）
    render(
      <Lobby
        room={makeRoomWithTwoParticipants()}
        participantId="bob-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    // When
    const button = screen.getByRole("button", { name: "ルームから抜ける" }) as HTMLButtonElement;
    // Then
    expect(button.disabled).toBe(false);
    expect(button.title).not.toContain("進行できる人がいなくなるため抜けられません");
  });

  it("最後の1人（自分だけ）でも抜けられる", () => {
    // Given
    const room = aRoomView({
      config: { members: ["Alice"], intervalMinutes: 5 },
      participants: [p({ participantId: "creator-p", displayName: "Alice" })],
    });
    render(
      <Lobby room={room} participantId="creator-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    // When
    const button = screen.getByRole("button", { name: "ルームから抜ける" }) as HTMLButtonElement;
    // Then
    expect(button.disabled).toBe(false);
  });

  it("onRemoveParticipant が未指定なら「ルームから抜ける」ボタンを描画しない", () => {
    render(<Lobby room={makeRoomWithTwoParticipants()} participantId="bob-p" onStartSession={noop} />);
    expect(screen.queryByRole("button", { name: "ルームから抜ける" })).toBeNull();
  });
});
