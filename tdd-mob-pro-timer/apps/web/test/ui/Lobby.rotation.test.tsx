/**
 * Lobby「ドライバーに加わる/外れる」自己トグルのテスト（UX 再設計 C2・2層モデル）
 * 参加者は本人の行で、ローテーション加入/離脱を切り替える。
 * 加入=member.add(自分のID・D6b)、離脱=member.remove(自分の rotation index)。
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

/** host=Alice(rotation済), 自分=Bob(editor・rotation未加入) の部屋。rotation は参加者IDの配列（D6b）。 */
function makeRoom(): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5 },
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "bob-p", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
  });
}

const noop = vi.fn();

/**
 * @requirements C2, v2.3 #1
 */
describe("Lobby ドライバー加入トグル", () => {
  it("ローテーション未加入の自分には「ドライバーに加わる」が出る", () => {
    render(<Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} />);
    expect(screen.getByRole("button", { name: /ドライバーに加わる/ })).toBeTruthy();
  });

  it("「ドライバーに加わる」を押すと自分がローテーションに加入する", () => {
    // Given
    const onJoinRotation = vi.fn();
    render(
      <Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /ドライバーに加わる/ }));
    // Then
    expect(onJoinRotation).toHaveBeenCalledWith("bob-p");
  });

  it("ローテーション加入済みの自分には「列から外れる」が出て自分のIDで離脱する", () => {
    // Given（2人ローテーションにして「外れる」を有効化。最後の1人は外れられないため。
    // index ではなく自名を渡す。index は App が最新 snapshot から解決する）
    const onLeaveRotation = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onLeaveRotation={onLeaveRotation} />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /列から外れる|外れる/ }));
    // Then
    expect(onLeaveRotation).toHaveBeenCalledWith("host-p");
  });

  it("ホストは見学者を『ドライバーに追加』できる", () => {
    // Given（host=Alice 視点。Bob は rotation 未加入＝見学）
    const onJoinRotation = vi.fn();
    render(
      <Lobby room={makeRoom()} participantId="host-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: "Bob をドライバーに追加" }));
    // Then
    expect(onJoinRotation).toHaveBeenCalledWith("bob-p");
  });

  it("ホストはドライバー順を入れ替えられる", () => {
    // Given
    const onMoveRotation = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onMoveRotation={onMoveRotation} />,
    );
    // When（Bob（rotation index 1）を前の順番へ → move(1, 0)）
    fireEvent.click(screen.getByRole("button", { name: "Bob を前の順番へ" }));
    // Then
    expect(onMoveRotation).toHaveBeenCalledWith(1, 0);
  });

  it("ホストには『ランダム』ボタンが出て、押すとローテーションがランダムに並べ替わる", () => {
    // Given
    const onShuffle = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onShuffle={onShuffle} />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /ランダム/ }));
    // Then
    expect(onShuffle).toHaveBeenCalledTimes(1);
  });

  it("ホストでない参加者には『ランダム』ボタンを出さない", () => {
    // When
    render(
      <Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} onShuffle={vi.fn()} />,
    );
    // Then
    expect(screen.queryByRole("button", { name: /ランダム/ })).toBeNull();
  });
});

// ─── 同名参加者の区別（実機検証で判明した欠落）────────────────────────
// Lobby は RosterPanel とは別のリスト実装で、同名を区別する配慮が無かった。
// 同名が並ぶのは本 Issue の主要シナリオ（二重参加の幽霊・再接続）でロビーでも起きる。

/**
 * @requirements FR-084
 */
describe("Lobby 同名参加者の区別", () => {
  /** host=Alice と、同名の Bob 2名（片方は輪の中）が居る部屋。 */
  function makeDupRoom(): Room {
    const room = makeRoom();
    return {
      ...room,
      session: { ...room.session, rotation: ["host-p", "bob-0002"], driverCounts: [0, 0] },
      participants: [
        p({ participantId: "host-p", displayName: "Alice", role: "host" }),
        p({ participantId: "pid-0002", displayName: "Bob", connId: "c2" }),
        p({ participantId: "pid-0003", displayName: "Bob", connId: "c3" }),
      ],
    };
  }

  it("同名2名の操作ボタンが互いに異なるラベルになる", () => {
    // Given
    render(
      <Lobby
        room={makeDupRoom()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    // When
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((a) => a.includes("を退出させる"));
    // Then
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toContain("Bob（ID: 0002） を退出させる");
    expect(labels).toContain("Bob（ID: 0003） を退出させる");
  });

  it("同名がいると行の表示名にも識別子が出る（目で見ても区別できる）", () => {
    // When
    render(<Lobby room={makeDupRoom()} participantId="host-p" onStartSession={noop} />);
    // Then
    expect(screen.queryByText("Bob")).toBeNull();
    expect(screen.getByText("Bob（ID: 0002）")).toBeTruthy();
    expect(screen.getByText("Bob（ID: 0003）")).toBeTruthy();
  });

  it("同名がいなければ識別子を添えない（通常時に読みにくくしない）", () => {
    // When
    render(
      <Lobby
        room={makeRoom()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    // Then
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByLabelText("Bob を退出させる")).toBeTruthy();
  });
});

// ─── 退出の確認（実機検証で判明した欠落）──────────────────────────
// Session 画面の RosterPanel は確認を挟むが、Lobby は1クリックで即退出だった。
// 同名が並ぶ場面では取り返しのつかない誤操作に直結する。

/**
 * @requirements FR-075, FR-076
 */
describe("Lobby 退出の確認", () => {
  function makeRoomWithGuest(): Room {
    return makeRoom();
  }

  it("退出ボタンを押しても即座には退出させない（確認を挟む）", () => {
    // Given
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );
    // When
    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    // Then
    expect(onRemoveParticipant).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("確認ダイアログに対象者の名前と再参加できる旨を出す", () => {
    // Given
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );
    // When
    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    // Then（敬称は helper に付けさせる。通知の文面と同じ語順に揃える。
    // 共有ルームなので他の参加者へ影響することも明示する）
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Bob さん");
    expect(dialog.textContent).toContain("再参加");
    expect(dialog.textContent).toContain("他の参加者");
  });

  it("確認して初めて退出処理が実行される", () => {
    // Given
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );
    // When
    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    fireEvent.click(screen.getByRole("button", { name: "退出させる" }));
    // Then
    expect(onRemoveParticipant).toHaveBeenCalledWith("bob-p");
  });

  it("キャンセルすると退出させない", () => {
    // Given
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );
    // When
    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    // Then
    expect(onRemoveParticipant).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ─── 確認中に世界が変わる（実機の敵対的検証で判明）────────────────────────────

describe("Lobby 確認ダイアログの陳腐化", () => {
  function roomWithBob(): Room {
    return makeRoom();
  }

  it("確認中に対象が改名したら表示も追従する", () => {
    // Given
    const room = roomWithBob();
    const { rerender } = render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    expect(screen.getByRole("dialog").textContent).toContain("Bob さん");
    // When（確認中に対象が改名する）
    const renamed: Room = {
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === "bob-p" ? { ...p, displayName: "Bobby" } : p,
      ),
    };
    rerender(
      <Lobby room={renamed} participantId="host-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    // Then
    expect(screen.getByRole("dialog").textContent).toContain("Bobby さん");
  });

  it("確認中に対象が居なくなったらダイアログを閉じる", () => {
    // Given
    const room = roomWithBob();
    const { rerender } = render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // When（確認中に対象が退出済みになる）
    const gone: Room = {
      ...room,
      participants: room.participants.filter((p) => p.participantId !== "bob-p"),
    };
    rerender(
      <Lobby room={gone} participantId="host-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    // Then
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
