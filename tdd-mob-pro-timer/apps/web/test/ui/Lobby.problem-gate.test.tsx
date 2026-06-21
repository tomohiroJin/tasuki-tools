/**
 * Lobby お題ゲート・トグルのテスト（Task 8）
 * - problemEnabled=false かつ problem=null でも開始ボタンが活性
 * - problemEnabled=false のときお題セクションを表示しない
 * - host がトグルを操作すると onConfigSet が呼ばれる
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room, Participant } from "@tdd-mob/core";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

function makeRoom(configOverrides?: object): Room {
  return {
    code: "TEST01", createdAt: 0, hostParticipantId: "host-p",
    config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5, ...configOverrides },
    problem: null,
    session: { rotation: ["Alice"], currentIndex: 0, isPaused: false, driverCounts: [0], totalSwitches: 0 },
    clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    phase: "setup",
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
    ],
    sessionRecords: [], handoffNote: "", onBreak: false,
  };
}

const noop = vi.fn();

describe("Lobby お題ゲート（Task 8）", () => {
  it("problemEnabled=false かつ problem=null でも開始ボタンが活性", () => {
    const room = makeRoom({ problemEnabled: false });
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    const btn = screen.getByRole("button", { name: /セッションを開始/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("problemEnabled=false のときお題セクションを表示しない", () => {
    const room = makeRoom({ problemEnabled: false });
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    // お題・設定タブをクリックして表示を切り替える
    const optionsTab = screen.getByRole("tab", { name: /お題・設定/ });
    fireEvent.click(optionsTab);
    // お題セクションヘッダーが存在しないことを確認
    expect(screen.queryByText("お題")).toBeNull();
  });

  it("problemEnabled=true（デフォルト）かつ problem=null のとき開始ボタンが無効", () => {
    const room = makeRoom(); // problemEnabled undefined = default true
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    const btn = screen.getByRole("button", { name: /セッションを開始/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("host が「お題を使う」チェックボックスを外すと onConfigSet({ problemEnabled: false }) が呼ばれる", () => {
    const onConfigSet = vi.fn();
    const room = makeRoom(); // problemEnabled=true
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} onConfigSet={onConfigSet} />);
    const optionsTab = screen.getByRole("tab", { name: /お題・設定/ });
    fireEvent.click(optionsTab);
    const checkbox = screen.getByRole("checkbox", { name: /お題を使う/ });
    fireEvent.click(checkbox);
    expect(onConfigSet).toHaveBeenCalledWith({ problemEnabled: false });
  });
});
