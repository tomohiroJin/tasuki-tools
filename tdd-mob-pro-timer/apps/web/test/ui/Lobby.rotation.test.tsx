/**
 * Lobby「ドライバーに加わる/外れる」自己トグルのテスト（UX 再設計 C2・2層モデル）
 * 参加者は本人の行で、ローテーション加入/離脱を切り替える。
 * 加入=member.add(自名)、離脱=member.remove(自分の rotation index)。
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

/** host=Alice(rotation済), 自分=Bob(editor・rotation未加入) の部屋 */
function makeRoom(): Room {
  return {
    code: "TEST01", createdAt: 0, hostParticipantId: "host-p",
    config: { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 5 },
    problem: null,
    session: { rotation: ["Alice"], currentIndex: 0, isPaused: false, driverCounts: [0], totalSwitches: 0 },
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

  it("「ドライバーに加わる」で onJoinRotation(自名) が呼ばれる", () => {
    const onJoinRotation = vi.fn();
    render(
      <Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ドライバーに加わる/ }));
    expect(onJoinRotation).toHaveBeenCalledWith("Bob");
  });

  it("ローテーション加入済みの自分には「列から外れる」が出て自名で離脱する", () => {
    const onLeaveRotation = vi.fn();
    // 2人ローテーションにして「外れる」を有効化（最後の1人は外れられないため）。
    const room = makeRoom();
    room.session.rotation = ["Alice", "Bob"];
    room.session.driverCounts = [0, 0];
    // index ではなく自名を渡す（index は App が最新 snapshot から解決・レビュー #1）。
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onLeaveRotation={onLeaveRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /列から外れる|外れる/ }));
    expect(onLeaveRotation).toHaveBeenCalledWith("Alice");
  });

  it("ホストは見学者を『ドライバーに追加』できる（②）", () => {
    const onJoinRotation = vi.fn();
    // host=Alice 視点。Bob は rotation 未加入（見学）。
    render(
      <Lobby room={makeRoom()} participantId="host-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bob をドライバーに追加" }));
    expect(onJoinRotation).toHaveBeenCalledWith("Bob");
  });

  it("ホストはドライバー順を入れ替えられる（④）", () => {
    const onMoveRotation = vi.fn();
    const room = makeRoom();
    room.session.rotation = ["Alice", "Bob"];
    room.session.driverCounts = [0, 0];
    render(
      <Lobby room={room} participantId="host-p" onStartSession={noop} onMoveRotation={onMoveRotation} />,
    );
    // Bob（rotation index 1）を前の順番へ → move(1, 0)
    fireEvent.click(screen.getByRole("button", { name: "Bob を前の順番へ" }));
    expect(onMoveRotation).toHaveBeenCalledWith(1, 0);
  });
});
