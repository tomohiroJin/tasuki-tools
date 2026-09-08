/**
 * ロビーは全員を同格に扱う（#95 S3・役割とホストの廃止）。
 *
 * この段でいちばん目に見える変化は「**居合わせた誰でもセッションを開始できる**」ことである。
 * かつては開始ボタンを主催者にだけ出し、それ以外には
 * 「主催者のセッション開始を待っています...」という案内を出していた
 * （`ui/start-wait-message.ts` と `test/ui/Lobby.host-absent.test.tsx`。どちらも S3 で削除）。
 * 旧概念を消した側のテストだけを畳むと、**開始ボタンに `isHost` ゲートを戻しても
 * 一式が緑のまま**になる。ここで新しい性質のほうを固定する。
 *
 * ロビーの参加者一覧は `RosterPanel` ではなく **Lobby 自前の実装**で、
 * 行の操作（ドライバーに追加／並べ替え／退出させる）も別系統のゲートを持っていた。
 * `RosterPanel` のテストはここまで届かないので、他人の行の操作も
 * 「部屋を作っていない人の視点」で見る。
 *
 * @requirements FR-065, FR-066, FR-081, US1
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room, Participant } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

/**
 * Alice（部屋を作った人）と Bob の 2 名。視点はつねに Bob（作った人ではない側）に置く。
 * `problemEnabled: false` にして、お題待ちによる開始ボタンの無効化と混ざらないようにする。
 */
function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5, problemEnabled: false },
    session: { rotation: ["creator-p"], driverCounts: [0] },
    participants: [
      p({ participantId: "creator-p", displayName: "Alice" }),
      p({ participantId: "bob-p", displayName: "Bob", connId: "c2" }),
    ],
    ...overrides,
  });
}

const noop = vi.fn();

describe("ロビーの開始は全員が押せる", () => {
  it("部屋を作った人でなくてもセッションを開始できる", () => {
    // Given（視点=Bob。かつては主催者にしか開始ボタンが出なかった）
    const onStartSession = vi.fn();
    // When
    render(<Lobby room={makeRoom()} participantId="bob-p" onStartSession={onStartSession} />);
    const btn = screen.getByRole("button", { name: /セッションを開始/ }) as HTMLButtonElement;
    fireEvent.click(btn);
    // Then
    expect(btn.disabled).toBe(false);
    expect(onStartSession).toHaveBeenCalledTimes(1);
  });

  it("開始を待たせる案内をどこにも出さない", () => {
    // Given（視点=Bob）
    // When
    render(<Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} />);
    // Then（開始ボタンが描かれていることを先に固定してから、案内の不在を見る）
    expect(screen.getByRole("button", { name: /セッションを開始/ })).toBeTruthy();
    expect(screen.queryByText(/開始を待/)).toBeNull();
    expect(screen.queryByText(/主催者/)).toBeNull();
  });
});

/**
 * ロビーの行操作は Lobby 自前の一覧が描く（`RosterPanel` とは別実装）。
 *
 * @requirements FR-065, FR-107
 */
describe("ロビーの行操作は全員に出る", () => {
  it("部屋を作った人でなくても他人をドライバーに追加できる", () => {
    // Given（視点=Bob。Alice は rotation 内なので「ドライバーから外す」が出る側）
    const onJoinRotation = vi.fn();
    const room = makeRoom({ session: { rotation: [], currentIndex: 0, isPaused: false, driverCounts: [], totalSwitches: 0 } });
    // When
    render(
      <Lobby room={room} participantId="bob-p" onStartSession={noop} onJoinRotation={onJoinRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Alice をドライバーに追加" }));
    // Then
    expect(onJoinRotation).toHaveBeenCalledWith("creator-p");
  });

  it("部屋を作った人でなくても他人を退出させる操作が出る", () => {
    // Given（視点=Bob）
    // When
    render(
      <Lobby room={makeRoom()} participantId="bob-p" onStartSession={noop} onRemoveParticipant={vi.fn()} />,
    );
    // Then
    expect(screen.getByRole("button", { name: "Alice を退出させる" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bob を退出させる" })).toBeNull();
  });

  it("部屋を作った人でなくても他人のドライバー順を入れ替えられる", () => {
    // Given（視点=Bob。2 人ローテーションにして並べ替えを意味あるものにする）
    const onMoveRotation = vi.fn();
    const room = makeRoom({
      session: { rotation: ["creator-p", "bob-p"], currentIndex: 0, isPaused: false, driverCounts: [0, 0], totalSwitches: 0 },
    });
    // When
    render(
      <Lobby room={room} participantId="bob-p" onStartSession={noop} onMoveRotation={onMoveRotation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Alice を後の順番へ" }));
    // Then
    expect(onMoveRotation).toHaveBeenCalledWith(0, 1);
  });
});
