/**
 * Session の操作提示が権限判定に一致することのテスト（host-spof-relaxation G5・T031/T035）
 *
 * サーバーを緩めても UI がボタンを隠していれば利用者から見て何も変わらない。
 * 画面の活性は `isHost` ではなく、サーバーと同じ `isAllowed()` で決める。
 *
 * 要件: FR-076, FR-080, FR-081, FR-082, US1, US7
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
  members: ["Alice", "Carol"],
  intervalMinutes: 5,
};

/** Alice(host) / Bob(viewer) / Carol(editor) が在室するセッション中の部屋。 */
function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-1",
    config,
    session: { rotation: ["Alice", "Carol"], driverCounts: [0, 0] },
    phase: "session",
    // 開始済み（G1 の単調フラグ）。判定はこれを見る。
    startedAt: 5000,
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "view-1", displayName: "Bob", role: "viewer", connId: "c2" }),
      makeParticipant({ participantId: "edit-1", displayName: "Carol", role: "editor", connId: "c3" }),
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
    onTransferHost: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onMoveRotation: vi.fn(),
    onSelfRoleChange: vi.fn(),
  };
}

/**
 * @requirements FR-081, FR-067
 */
describe("Session: 開始後は主催者以外にも操作を提示する", () => {
  it("host でない editor にも終了系ゾーン（完成・中断・最初から）が出る", () => {
    render(<Session room={makeRoom()} participantId="edit-1" {...baseHandlers()} />);

    expect(screen.getByRole("group", { name: "セッションを終える" })).toBeTruthy();
  });

  it("host でない editor にもランダム化が出る", () => {
    render(<Session room={makeRoom()} participantId="edit-1" {...baseHandlers()} />);

    expect(screen.getAllByLabelText("ドライバー順をランダムに並べ替える").length).toBeGreaterThan(0);
  });

  it("見学者には終了系ゾーンを出さない（実行できない操作は提示しない）", () => {
    render(<Session room={makeRoom()} participantId="view-1" {...baseHandlers()} />);

    expect(screen.queryByRole("group", { name: "セッションを終える" })).toBeNull();
  });
});

/**
 * @requirements FR-066
 */
describe("Session: 開始前は従来どおり主催者主導", () => {
  /** 開始前（startedAt 未設定）。phase は session だが判定は startedAt を見る。 */
  const beforeStart = () => makeRoom({ startedAt: null });

  it("開始前は host でない editor に終了系ゾーンを出さない", () => {
    render(<Session room={beforeStart()} participantId="edit-1" {...baseHandlers()} />);

    expect(screen.queryByRole("group", { name: "セッションを終える" })).toBeNull();
  });

  it("開始前でも host には終了系ゾーンを出す", () => {
    render(<Session room={beforeStart()} participantId="host-1" {...baseHandlers()} />);

    expect(screen.getByRole("group", { name: "セッションを終える" })).toBeTruthy();
  });

  it("開始前は host でない editor にランダム化を出さない", () => {
    render(<Session room={beforeStart()} participantId="edit-1" {...baseHandlers()} />);

    expect(screen.queryByLabelText("ドライバー順をランダムに並べ替える")).toBeNull();
  });
});

/**
 * @requirements FR-082, T035
 */
describe("Session: 開始者は記録上の情報にすぎない", () => {
  it("開始後はホストにも「ホストを譲る」を提示しない（特権の受け渡しという概念を消す）", () => {
    render(<Session room={makeRoom()} participantId="host-1" {...baseHandlers()} />);

    expect(screen.queryByLabelText("Carol にホストを譲る")).toBeNull();
  });

  it("開始前はホストに「ホストを譲る」を提示する（準備段階の主催者主導は維持）", () => {
    // Given（開始前の部屋）
    const room = makeRoom({ startedAt: null });
    // When
    render(<Session room={room} participantId="host-1" {...baseHandlers()} />);
    // Then
    expect(screen.getAllByLabelText("Carol にホストを譲る").length).toBeGreaterThan(0);
  });
});

// ─── 見学者の自己解消導線（レビュー指摘 #2/#3/#4 への対応） ───────────────────
// 見学者には SelfDriverToggle（editor+ 限定）が出ないため、開始後に自分で
// 進行へ戻る／部屋を抜ける手段が画面上どこにも無かった。サーバーは両方とも
// 許可しているので、自己退出と自己昇格が UI 上だけ未達だった。

/**
 * @requirements FR-069, FR-073b, FR-079, FR-080, FR-066
 */
describe("Session: 見学者の自己解消導線", () => {
  it("見学者にルームから抜ける導線が出る", () => {
    render(<Session room={makeRoom()} participantId="view-1" {...baseHandlers()} />);

    expect(screen.getAllByRole("button", { name: "ルームから抜ける" }).length).toBeGreaterThan(0);
  });

  it("開始後の見学者に「進行に加わる」導線が出る（詰みの自己解消）", () => {
    render(<Session room={makeRoom()} participantId="view-1" {...baseHandlers()} />);

    expect(screen.getAllByRole("button", { name: "進行に加わる" }).length).toBeGreaterThan(0);
  });

  it("押すと自分の役割を editor へ変える要求が出る", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="view-1" {...handlers} />);
    // When
    fireEvent.click(screen.getAllByRole("button", { name: "進行に加わる" })[0]!);
    // Then
    expect(handlers.onSelfRoleChange).toHaveBeenCalledWith("editor");
  });

  it("開始前の見学者には「進行に加わる」を出さない（開始前はホストのみ）", () => {
    // Given（開始前の部屋）
    const room = makeRoom({ startedAt: null });
    // When
    render(<Session room={room} participantId="view-1" {...baseHandlers()} />);
    // Then
    expect(screen.queryByRole("button", { name: "進行に加わる" })).toBeNull();
  });

  it("なぜ操作が出ていないかの理由を提示する", () => {
    render(<Session room={makeRoom()} participantId="view-1" {...baseHandlers()} />);

    // permissionHint が返す「見学中は実行できません…」を画面に出す。
    expect(screen.getAllByText(/見学中は実行できません/).length).toBeGreaterThan(0);
  });

  it("編集者にはこの案内を出さない（実行できる人に不要な文言を見せない）", () => {
    render(<Session room={makeRoom()} participantId="edit-1" {...baseHandlers()} />);

    expect(screen.queryByText(/見学中は実行できません/)).toBeNull();
  });
});

// ─── ルームタブ側のガード（Session タブとの非対称を防ぐ） ─────────────────────
// Session.tsx は同じ判定を2箇所（セッションタブ／ルームタブ）に書いている。
// 片方だけ壊れても気づけるよう、タブを切り替えて独立に検証する。

/**
 * @requirements FR-081, FR-082
 */
describe("Session: ルームタブでも判定が一致する", () => {
  /** ルームタブへ切り替える。Tabs は非アクティブなタブの中身をマウントしない。 */
  const openRoomTab = () => fireEvent.click(screen.getByRole("tab", { name: "ルーム" }));

  it("開始後はルームタブでも「ホストを譲る」を提示しない", () => {
    // Given
    render(<Session room={makeRoom()} participantId="host-1" {...baseHandlers()} />);
    // When
    openRoomTab();
    // Then
    expect(screen.queryByLabelText("Carol にホストを譲る")).toBeNull();
  });

  it("開始前はルームタブで「ホストを譲る」を提示する", () => {
    // Given
    render(
      <Session room={makeRoom({ startedAt: null })} participantId="host-1" {...baseHandlers()} />,
    );
    // When
    openRoomTab();
    // Then
    expect(screen.getByLabelText("Carol にホストを譲る")).toBeTruthy();
  });

  it("開始後はルームタブでも host でない editor にランダム化を出す", () => {
    // Given
    render(<Session room={makeRoom()} participantId="edit-1" {...baseHandlers()} />);
    // When
    openRoomTab();
    // Then
    expect(screen.getByLabelText("ドライバー順をランダムに並べ替える")).toBeTruthy();
  });

  it("編集者はルームタブからもルームを抜けられる（タブ間で導線を非対称にしない）", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="edit-1" {...handlers} />);
    // When
    openRoomTab();
    fireEvent.click(screen.getByRole("button", { name: "ルームから抜ける" }));
    // Then
    expect(handlers.onRemoveParticipant).toHaveBeenCalledWith("edit-1");
  });

  it("見学者はルームタブからも進行に加われる", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="view-1" {...handlers} />);
    // When
    openRoomTab();
    fireEvent.click(screen.getByRole("button", { name: "進行に加わる" }));
    // Then
    expect(handlers.onSelfRoleChange).toHaveBeenCalledWith("editor");
  });
});
