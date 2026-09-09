/**
 * Session × 引き継ぎノート（handoffNote）入力のテスト
 * 仕様 §9.1「引き継ぎノート」: 「次の人へ」のメモを残せ、交代時に提示される。
 *
 * バックエンド（handoff.note.set コマンド・evolve）は実装済みだが、
 * Web UI に入力経路が無かった。ここでは「誰でも編集でき、blur で
 * onHandoffNoteSet が発火する」を検証する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1",
    connId: "c1",
    displayName: "Alice",
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
    config,
    // rotation は参加者IDの配列（D6b）。Bob は輪の外に置き、
    // 「輪の外の在席者でもメモを読める」を実際にその状態で確かめられるようにする。
    session: { rotation: ["p-alice", "p-carol"], driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "p-alice", displayName: "Alice" }),
      makeParticipant({ participantId: "p-carol", displayName: "Carol", connId: "c2" }),
      makeParticipant({ participantId: "p-bob", displayName: "Bob", connId: "c3" }),
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
  it("共有メモの入力欄が表示される（「編集」クリック後）", () => {
    // Given
    render(
      <Session
        room={makeRoom()}
        participantId="p-alice"
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
        participantId="p-alice"
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
        participantId="p-alice"
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

  it("輪の外の在席者でもメモを読めて、編集にも入れる", () => {
    // Given（かつては役割が viewer の人に読み取り専用表示を返していた・#95 S3 で廃止）
    render(
      <Session
        room={makeRoom({ handoffNote: "残りはリファクタ" })}
        participantId="p-bob"
        {...baseHandlers()}
        onHandoffNoteSet={vi.fn()}
      />,
    );
    // When（自分が本当に輪の外に居ることを先に確かめてから、既定のプレビューを編集へ切り替える）
    expect(screen.getByText(/ドライバーの輪の外/)).toBeTruthy();
    expect(screen.getByText(/残りはリファクタ/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    // Then
    const field = screen.getByLabelText(/共有メモ/) as HTMLTextAreaElement;
    expect(field.value).toBe("残りはリファクタ");
  });
});
