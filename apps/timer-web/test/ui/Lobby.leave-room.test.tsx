/**
 * ロビーの自己退出導線（Issue #37）。
 *
 * セッション開始前のロビーには「ルームから抜ける」導線が無く、気が変わった参加者は
 * タブを閉じる（＝切断。オフラインとして残り続け、ローテーションの枠も残る）しかなかった。
 * サーバー側の participant.remove（自己対象）は既に正規経路として通るため、
 * ここではロビーの参加者一覧に導線を足すだけでよい（App.tsx 側の遷移は対象外）。
 *
 * 確認ダイアログは自己操作のため課さない（FR-079 の既存判断を踏襲）。
 * ホストが他人を退出させる既存フロー（RemovalConfirmDialog 経由）とは別経路。
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
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

/** host=Alice、自分=Bob(editor) の部屋。編集者以上が2名（Alice・Bob）在室する。 */
function makeRoomWithTwoEditors(): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5 },
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "bob-p", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
  });
}

/**
 * host=Alice（唯一の編集者以上）＋見学者 Carol の部屋。
 *
 * `@tasuki/timer-core` の `canRemoveParticipant` は「退出後に在室者そのものが0名になる」場合は
 * 不変条件の適用対象を失うとして許可する（＝最後の1人は抜けられる）。無効化を確認するには
 * 「自分が抜けても他の在室者（編集者以上でない人）が残る」構成が必要。
 */
function makeRoomWithOnlyHostAndViewer(): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5 },
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "carol-p", displayName: "Carol", role: "viewer", connId: "c3" }),
    ],
  });
}

const noop = vi.fn();

describe("ロビー: 自分の行の「ルームから抜ける」", () => {
  it("自分の行に「ルームから抜ける」ボタンが表示される", () => {
    render(
      <Lobby
        room={makeRoomWithTwoEditors()}
        participantId="bob-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });

  it("押すと確認ダイアログを経由せず自分が退出する", () => {
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithTwoEditors()}
        participantId="bob-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );
    screen.getByRole("button", { name: "ルームから抜ける" }).click();
    expect(onRemoveParticipant).toHaveBeenCalledWith("bob-p");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("在室する編集者以上が自分1名のみで、自分以外の在室者(見学者)が残るとき disabled になり理由が title に出る", () => {
    render(
      <Lobby
        room={makeRoomWithOnlyHostAndViewer()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "ルームから抜ける" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("進行できる人がいなくなるため抜けられません");
  });

  it("他に編集者以上がいる場合は enabled のまま", () => {
    render(
      <Lobby
        room={makeRoomWithTwoEditors()}
        participantId="bob-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "ルームから抜ける" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("最後の1人（自分だけ）は enabled のまま抜けられる（退出後に在室者が0名になるため不変条件は適用外）", () => {
    const room = aRoomView({
      config: { members: ["Alice"], intervalMinutes: 5 },
      participants: [p({ participantId: "host-p", displayName: "Alice", role: "host" })],
    });
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: "ルームから抜ける" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("onRemoveParticipant が未指定なら「ルームから抜ける」ボタンを描画しない", () => {
    render(<Lobby room={makeRoomWithTwoEditors()} participantId="bob-p" onStartSession={noop} />);
    expect(screen.queryByRole("button", { name: "ルームから抜ける" })).toBeNull();
  });
});
