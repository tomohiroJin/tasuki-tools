/**
 * セッション画面は全員に同じ導線を出す（#95 S3・役割とホストの廃止）。
 *
 * かつては `test/ui/Session.permissions.test.tsx` が「開始前はホスト主導・開始後は
 * 編集者以上」という規則表どおりに導線が出ることを固定していた。役割そのものが
 * 消えたので、その規則表は無い。**それでも残る性質は捨てない** —— 終了系ゾーン・
 * ランダム化・ルームから抜けるは、いま「誰にでも出る」という形で生きている。
 * ここはその新しい形を固定する。
 *
 * とくに `SelfDriverToggle` は重要である。進行から外れたい人が押せる操作は、
 * 見学者盤（`SpectatorSelfActions`）が消えたいま、この盤の「一時離脱／列から外れる」
 * だけになった。かつてこの盤は「編集者以上」にしか出ておらず、そのまま塞いだままにすると
 * 外れたい人に押せる操作が画面上どこにも無くなる。
 *
 * Session.tsx は同じ導線をセッションタブとルームタブの 2 箇所に書いている。
 * 片方だけ塞がっても気づけるよう、タブを切り替えて独立に見る。
 *
 * @requirements FR-065, FR-078, FR-079, FR-081, FR-082, US1, US7
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
  members: ["Alice", "Carol"],
  intervalMinutes: 5,
};

/**
 * Alice（部屋を作った人）・Bob（輪の外）・Carol（ドライバー）が在室するセッション中の部屋。
 * 視点を Bob へ置くと「かつては何も操作が出なかった人」を再現できる。
 */
function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "AA0001",
    config,
    session: { rotation: ["p-alice", "p-carol"], driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "p-alice", displayName: "Alice" }),
      makeParticipant({ participantId: "p-bob", displayName: "Bob" }),
      makeParticipant({ participantId: "p-carol", displayName: "Carol" }),
    ],
    ...overrides,
  });
}

function baseHandlers() {
  return {
    onSkip: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onRestartTimer: vi.fn(),
    onComplete: vi.fn(),
    onAbort: vi.fn(),
    onReset: vi.fn(),
    onRenameParticipant: vi.fn(),
    onDriverSkip: vi.fn(),
    onDriverResume: vi.fn(),
    onAddProxy: vi.fn(),
    onDriverAssign: vi.fn(),
    onShuffle: vi.fn(),
    onSetPassphrase: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onMoveRotation: vi.fn(),
    onJoinRotation: vi.fn(),
    onLeaveRotation: vi.fn(),
  };
}

/** ルームタブへ切り替える。Tabs は非アクティブなタブの中身をマウントしない。 */
const openRoomTab = () => fireEvent.click(screen.getByRole("tab", { name: "ルーム" }));

describe("#95 S3: セッションの導線は全員に出る", () => {
  it("部屋を作った人でなくても終了系ゾーンが出る", () => {
    // Given（自分=Bob。かつては開始前ホスト限定・開始後編集者以上だった）
    // When
    render(<Session room={makeRoom()} participantId="p-bob" {...baseHandlers()} />);
    // Then
    expect(screen.getByRole("group", { name: "セッションを終える" })).toBeTruthy();
  });

  // かつてここに「開始前でも終了系ゾーンが出る」があった。「開始前」は `startedAt` が
  // 無い状態としてしか表せず、#95 S4a でその項目ごと消えたため、直前の 1 本と
  // **文字どおり同じテスト**になった（`EndSessionZone` は段階で出し分けていない）。
  // 重複を残さず畳んである。

  it("部屋を作った人でなくてもランダム化が出る", () => {
    // Given（自分=Bob）
    // When
    render(<Session room={makeRoom()} participantId="p-bob" {...baseHandlers()} />);
    // Then
    expect(screen.getAllByLabelText("ドライバー順をランダムに並べ替える").length).toBeGreaterThan(0);
  });

  it("ルームタブでもランダム化が出る（タブ間で導線を非対称にしない）", () => {
    // Given
    render(<Session room={makeRoom()} participantId="p-bob" {...baseHandlers()} />);
    // When
    openRoomTab();
    // Then
    expect(screen.getByLabelText("ドライバー順をランダムに並べ替える")).toBeTruthy();
  });

  it("ルームタブからルームを抜けられる", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="p-bob" {...handlers} />);
    // When
    openRoomTab();
    fireEvent.click(screen.getByRole("button", { name: "ルームから抜ける" }));
    // Then
    expect(handlers.onRemoveParticipant).toHaveBeenCalledWith("p-bob");
  });
});

/**
 * 進行から外れる導線（`SelfDriverToggle`）は全員に出る。
 *
 * これは見学者盤の代替であって、飾りではない。ここが塞がると
 * 「もう運転しない」と言う手段が画面から消える。
 *
 * @requirements FR-078, FR-083
 */
describe("#95 S3: 進行から外れる導線は全員に出る", () => {
  it("輪の中の人には一時離脱と列から外れるが出る", () => {
    // Given（自分=Carol は rotation 内）
    // When
    render(<Session room={makeRoom()} participantId="p-carol" {...baseHandlers()} />);
    // Then
    expect(screen.getByRole("button", { name: "一時離脱" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "列から外れる" })).toBeTruthy();
  });

  it("輪の外の人にも自己トグルの盤が出て、輪へ加われる", () => {
    // Given（自分=Bob は rotation 外。かつては編集者以上にしか盤が出なかった）
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="p-bob" {...handlers} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "ドライバーに加わる" }));
    // Then
    expect(screen.getByText(/ドライバーの輪の外/)).toBeTruthy();
    expect(handlers.onJoinRotation).toHaveBeenCalledWith("p-bob");
  });

  it("一時離脱を押すと自分の driver.skip が送られる", () => {
    // Given（自分=Carol は rotation 内）
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="p-carol" {...handlers} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "一時離脱" }));
    // Then
    expect(handlers.onDriverSkip).toHaveBeenCalledWith("p-carol");
  });
});

/**
 * 役割とホストの導線・表示がどこにも残っていない。
 *
 * @requirements FR-082
 */
describe("#95 S3: ホストと見学者の痕跡が画面に無い", () => {
  it("セッションタブにホスト移譲も見学者盤も出さない", () => {
    // Given（部屋を作った Alice の視点＝かつて最も権限が多かった側）
    const room = makeRoom();
    // When
    render(<Session room={room} participantId="p-alice" {...baseHandlers()} />);
    // Then（名簿が描かれていることを先に固定してから、不在を見る）
    expect(screen.getByRole("list", { name: "ドライバー一覧" })).toBeTruthy();
    expect(screen.queryByLabelText("Carol にホストを譲る")).toBeNull();
    expect(screen.queryByText("あなたは見学者です")).toBeNull();
    expect(screen.queryByRole("button", { name: "進行に加わる" })).toBeNull();
    expect(screen.queryByRole("button", { name: "見学に回る" })).toBeNull();
  });

  it("ルームタブにもホスト移譲を出さない", () => {
    // Given
    render(<Session room={makeRoom()} participantId="p-alice" {...baseHandlers()} />);
    // When
    openRoomTab();
    // Then
    expect(screen.getByRole("list", { name: "ドライバー一覧" })).toBeTruthy();
    expect(screen.queryByLabelText("Carol にホストを譲る")).toBeNull();
  });
});
