/**
 * ロビーでの役割の切り替え（host-spof-relaxation G6・T046）
 *
 * 実機検証で判明: 役割を viewer にする経路がアプリ全体に存在しなかった。
 * 参加時の「見学で参加」はローテーションへ加わらないという意味しか持たず、役割は編集者のまま。
 * `role.set` を送る画面上の経路は自己昇格だけで、すでに見学者である人しか使えなかった。
 *
 * 結果として G5 で作った見学者向けの提示（拒否理由・進行に戻る・権限の制限）が
 * 実地では一度も発動しない。ここは開始前の担当（主催者が他の参加者を切り替える）を受け持つ。
 *
 * **開始前の権限範囲は変えない。** 主催者限定の導線を足すだけで、誰が何をできるかは従来どおり。
 *
 * 設計: docs/plans/host-spof-relaxation/plan.md「D7」
 * 要件: FR-083, FR-066
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
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

/** Alice(host) / Bob(editor) / Cid(viewer) が在室する開始前のルーム。 */
function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "LB0001",
    hostParticipantId: "host-1",
    config,
    session: { rotation: ["Alice", "Bob"], driverCounts: [0, 0] },
    startedAt: null,
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Bob", role: "editor", connId: "c2" }),
      makeParticipant({ participantId: "view-1", displayName: "Cid", role: "viewer", connId: "c3" }),
    ],
    ...overrides,
  });
}

function baseHandlers() {
  return {
    onStartSession: vi.fn(),
    onEditProblem: vi.fn(),
    onRegenerateProblem: vi.fn(),
    onPasteProblem: vi.fn(),
    onCopyProblem: vi.fn(),
    onConfigSet: vi.fn(),
    onJoinRotation: vi.fn(),
    onLeaveRotation: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onTransferHost: vi.fn(),
    onMoveRotation: vi.fn(),
    onShuffle: vi.fn(),
    onSetPassphrase: vi.fn(),
    onRoleSet: vi.fn(),
  };
}

describe("Lobby: 役割の切り替え（FR-083）", () => {
  it("主催者には他の参加者を見学者にする操作が出る", () => {
    render(<Lobby room={makeRoom()} participantId="host-1" {...baseHandlers()} />);

    expect(screen.getByLabelText("Bob を見学者にする")).toBeTruthy();
  });

  it("押すと対象を viewer にする要求が出る", () => {
    const handlers = baseHandlers();
    render(<Lobby room={makeRoom()} participantId="host-1" {...handlers} />);

    fireEvent.click(screen.getByLabelText("Bob を見学者にする"));

    expect(handlers.onRoleSet).toHaveBeenCalledWith("edit-1", "viewer");
  });

  it("見学者には進行に戻す操作が出る", () => {
    const handlers = baseHandlers();
    render(<Lobby room={makeRoom()} participantId="host-1" {...handlers} />);

    fireEvent.click(screen.getByLabelText("Cid を進行に戻す"));

    expect(handlers.onRoleSet).toHaveBeenCalledWith("view-1", "editor");
  });

  it("主催者でない参加者には出ない（開始前の権限範囲は変えない・FR-066）", () => {
    render(<Lobby room={makeRoom()} participantId="edit-1" {...baseHandlers()} />);

    expect(screen.queryByLabelText("Cid を進行に戻す")).toBeNull();
  });

  it("自分自身の行には出ない（ホストの自己降格は拒否されるため）", () => {
    render(<Lobby room={makeRoom()} participantId="host-1" {...baseHandlers()} />);

    expect(screen.queryByLabelText("Alice を見学者にする")).toBeNull();
  });

  it("ハンドラが無ければ出さない", () => {
    const { onRoleSet: _omitted, ...withoutRoleSet } = baseHandlers();
    render(<Lobby room={makeRoom()} participantId="host-1" {...withoutRoleSet} />);

    expect(screen.queryByLabelText("Bob を見学者にする")).toBeNull();
  });
});
