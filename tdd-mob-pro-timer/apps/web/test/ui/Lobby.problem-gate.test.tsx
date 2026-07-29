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
import { aRoomView } from "../support/room-view.js";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

function makeRoom(configOverrides?: object): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5, ...configOverrides },
    session: { rotation: ["Alice"] },
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
    ],
  });
}

const noop = vi.fn();

/**
 * @requirements Task 8
 */
describe("Lobby お題ゲート", () => {
  it("problemEnabled=false かつ problem=null でも開始ボタンが活性", () => {
    // Given
    const room = makeRoom({ problemEnabled: false });
    // When
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    // Then
    const btn = screen.getByRole("button", { name: /セッションを開始/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("problemEnabled=false のときお題セクションを表示しない", () => {
    // Given
    const room = makeRoom({ problemEnabled: false });
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    // When（「お題」タブをクリックして表示を切り替える）
    const optionsTab = screen.getByRole("tab", { name: /^お題$/ });
    fireEvent.click(optionsTab);
    // Then（お題セクションヘッダー（h2）が存在しないことを確認。タブ名「お題」とは区別）
    expect(screen.queryByRole("heading", { name: "お題" })).toBeNull();
  });

  it("problemEnabled=true（デフォルト）かつ problem=null のとき開始ボタンが無効", () => {
    // Given
    const room = makeRoom(); // problemEnabled undefined = default true
    // When
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} />);
    // Then
    const btn = screen.getByRole("button", { name: /セッションを開始/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("host が「お題なし」ラジオを押すと、お題機能を無効にする設定が保存される", () => {
    // Given
    const onConfigSet = vi.fn();
    const room = makeRoom(); // problemEnabled=true
    render(<Lobby room={room} participantId="host-p" onStartSession={noop} onConfigSet={onConfigSet} />);
    // When（お題タブへ切り替えてトグルを操作。トグルはお題タブ先頭に移動）
    fireEvent.click(screen.getByRole("tab", { name: /^お題$/ }));
    const radio = screen.getByRole("radio", { name: "お題なし" });
    fireEvent.click(radio);
    // Then
    expect(onConfigSet).toHaveBeenCalledWith({ problemEnabled: false });
  });
});
