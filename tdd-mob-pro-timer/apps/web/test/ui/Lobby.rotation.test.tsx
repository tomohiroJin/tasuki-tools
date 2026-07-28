/**
 * Lobby「ドライバーに加わる/外れる」自己トグルのテスト（UX 再設計 C2・2層モデル）
 * 参加者は本人の行で、ローテーション加入/離脱を切り替える。
 * 加入=member.add(自分のID・D6b)、離脱=member.remove(自分の rotation index)。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room, Participant } from "@tdd-mob/core";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

/** host=Alice(rotation済), 自分=Bob(editor・rotation未加入) の部屋。rotation は参加者IDの配列（D6b）。 */
function makeRoom(): Room {
  return {
    code: "TEST01", createdAt: 0, hostParticipantId: "host-p",
    config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    problem: null,
    session: { rotation: ["host-p"], currentIndex: 0, isPaused: false, driverCounts: [0], totalSwitches: 0 },
    clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    phase: "setup",
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host" }),
      p({ participantId: "bob-p", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
    sessionRecords: [], handoffNote: "", onBreak: false,
  };
}

const noop = vi.fn();

describe("Lobby ドライバー加入トグル（C2）", () => {
  it("ローテーション未加入の自分には「ドライバーに加わる」が出る", () => {
    render(<Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} />);
    expect(screen.getByRole("button", { name: /ドライバーに加わる/ })).toBeTruthy();
  });

  it("「ドライバーに加わる」で onJoinRotation(自分のID) が呼ばれる", () => {
    const onJoinRotation = vi.fn();
    render(
      <Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ドライバーに加わる/ }));
    expect(onJoinRotation).toHaveBeenCalledWith("bob-p");
  });

  it("ローテーション加入済みの自分には「列から外れる」が出て自分のIDで離脱する", () => {
    const onLeaveRotation = vi.fn();
    // 2人ローテーションにして「外れる」を有効化（最後の1人は外れられないため）。
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    // index ではなく自名を渡す（index は App が最新 snapshot から解決・レビュー #1）。
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onLeaveRotation={onLeaveRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /列から外れる|外れる/ }));
    expect(onLeaveRotation).toHaveBeenCalledWith("host-p");
  });

  it("ホストは見学者を『ドライバーに追加』できる（②）", () => {
    const onJoinRotation = vi.fn();
    // host=Alice 視点。Bob は rotation 未加入（見学）。
    render(
      <Lobby room={makeRoom()} participantId="host-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bob をドライバーに追加" }));
    expect(onJoinRotation).toHaveBeenCalledWith("bob-p");
  });

  it("ホストはドライバー順を入れ替えられる（④）", () => {
    const onMoveRotation = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onMoveRotation={onMoveRotation} />,
    );
    // Bob（rotation index 1）を前の順番へ → move(1, 0)
    fireEvent.click(screen.getByRole("button", { name: "Bob を前の順番へ" }));
    expect(onMoveRotation).toHaveBeenCalledWith(1, 0);
  });

  it("ホストには『ランダム』ボタンが出て、押すと onShuffle が呼ばれる（v2.3 #1）", () => {
    const onShuffle = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["host-p", "bob-p"];
    room.session.driverCounts = [0, 0];
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onShuffle={onShuffle} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ランダム/ }));
    expect(onShuffle).toHaveBeenCalledTimes(1);
  });

  it("ホストでない参加者には『ランダム』ボタンを出さない（v2.3 #1）", () => {
    render(
      <Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} onShuffle={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /ランダム/ })).toBeNull();
  });
});

// ─── 同名参加者の区別（実機検証で判明した欠落・FR-084）────────────────────────
// Lobby は RosterPanel とは別のリスト実装で、同名を区別する配慮が無かった。
// 同名が並ぶのは本 Issue の主要シナリオ（二重参加の幽霊・再接続）でロビーでも起きる。

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
    render(
      <Lobby
        room={makeDupRoom()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );

    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((a) => a.includes("を退出させる"));

    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toContain("Bob（ID: 0002） を退出させる");
    expect(labels).toContain("Bob（ID: 0003） を退出させる");
  });

  it("同名がいると行の表示名にも識別子が出る（目で見ても区別できる）", () => {
    render(<Lobby room={makeDupRoom()} participantId="host-p" onStartSession={noop} />);

    expect(screen.queryByText("Bob")).toBeNull();
    expect(screen.getByText("Bob（ID: 0002）")).toBeTruthy();
    expect(screen.getByText("Bob（ID: 0003）")).toBeTruthy();
  });

  it("同名がいなければ識別子を添えない（通常時に読みにくくしない）", () => {
    render(
      <Lobby
        room={makeRoom()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );

    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByLabelText("Bob を退出させる")).toBeTruthy();
  });
});

// ─── 退出の確認（FR-075/076・実機検証で判明した欠落）──────────────────────────
// Session 画面の RosterPanel は確認を挟むが、Lobby は1クリックで即退出だった。
// 同名が並ぶ場面では取り返しのつかない誤操作に直結する。

describe("Lobby 退出の確認", () => {
  function makeRoomWithGuest(): Room {
    return makeRoom();
  }

  it("退出ボタンを押しても即座には退出させない（確認を挟む）", () => {
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );

    fireEvent.click(screen.getByLabelText("Bob を退出させる"));

    expect(onRemoveParticipant).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("確認ダイアログに対象者の名前と再参加できる旨を出す（FR-075）", () => {
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Bob を退出させる"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Bob/)).toBeTruthy();
    expect(dialog.textContent).toContain("再参加");
    // 共有ルームなので他の参加者へ影響することも明示する（FR-076）。
    expect(dialog.textContent).toContain("他の参加者");
  });

  it("確認して初めて onRemoveParticipant が呼ばれる", () => {
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );

    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    fireEvent.click(screen.getByRole("button", { name: "退出させる" }));

    expect(onRemoveParticipant).toHaveBeenCalledWith("bob-p");
  });

  it("キャンセルすると退出させない", () => {
    const onRemoveParticipant = vi.fn();
    render(
      <Lobby
        room={makeRoomWithGuest()}
        participantId="host-p"
        onStartSession={noop}
        onRemoveParticipant={onRemoveParticipant}
      />,
    );

    fireEvent.click(screen.getByLabelText("Bob を退出させる"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onRemoveParticipant).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
