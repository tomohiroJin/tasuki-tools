/**
 * Session × 引き継ぎノート（handoffNote）入力のテスト
 * 仕様 §9.1「引き継ぎノート」: editor+ が「次の人へ」のメモを残せ、交代時に提示される。
 *
 * バックエンド（handoff.note.set コマンド・evolve）は実装済みだが、
 * Web UI に入力経路が無かった。ここでは「editor+ は編集でき、blur で
 * onHandoffNoteSet が発火する／viewer は読み取り専用」を検証する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-1",
    config,
    session: { rotation: ["Alice", "Bob"], driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
    ...overrides,
  });
}

const noop = () => {};
/** Session が要求する必須ハンドラを noop で満たす最小 props */
function baseHandlers() {
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

describe("Session 引き継ぎノート入力（§9.1）", () => {
  it("editor+ には共有メモの入力欄が表示される（「編集」クリック後）", () => {
    // Given
    render(
      <Session
        room={makeRoom()}
        participantId="host-1"
        {...baseHandlers()}
        onHandoffNoteSet={vi.fn()}
      />,
    );
    // When（初期はプレビューモード。「編集」ボタンを押すと入力欄が出る）
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const field = screen.getByLabelText(/共有メモ/);
    // Then（textarea/input であること＝読み取り専用テキストではない）
    expect(["TEXTAREA", "INPUT"]).toContain((field as HTMLElement).tagName);
  });

  it("メモを編集して blur すると入力値が onHandoffNoteSet へ渡る", () => {
    // Given
    const onHandoffNoteSet = vi.fn();
    render(
      <Session
        room={makeRoom()}
        participantId="host-1"
        {...baseHandlers()}
        onHandoffNoteSet={onHandoffNoteSet}
      />,
    );
    // When（初期はプレビューモード。「編集」ボタンを押してから入力）
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const field = screen.getByLabelText(/共有メモ/);
    fireEvent.change(field, { target: { value: "API のモックまで完了" } });
    fireEvent.blur(field);
    // Then
    expect(onHandoffNoteSet).toHaveBeenCalledWith("API のモックまで完了");
  });

  it("既存のメモは入力欄の初期値として反映される", () => {
    // Given
    render(
      <Session
        room={makeRoom({ handoffNote: "次はバリデーションから" })}
        participantId="host-1"
        {...baseHandlers()}
        onHandoffNoteSet={vi.fn()}
      />,
    );
    // When（既存メモがある場合は既定でプレビュー表示。「編集」に切り替えると入力欄に初期値が入る）
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const field = screen.getByLabelText(/共有メモ/) as HTMLTextAreaElement;
    // Then
    expect(field.value).toBe("次はバリデーションから");
  });

  it("viewer には編集欄を出さず、メモがあれば読み取り表示する", () => {
    // Given
    // When
    render(
      <Session
        room={makeRoom({ handoffNote: "残りはリファクタ" })}
        participantId="view-1"
        {...baseHandlers()}
        onHandoffNoteSet={vi.fn()}
      />,
    );
    // Then（viewer 視点＝rotation 外の閲覧者。編集欄は無いがメモ内容は読める）
    expect(screen.queryByLabelText(/共有メモ/)).toBeNull();
    expect(screen.getByText(/残りはリファクタ/)).toBeTruthy();
  });
});
