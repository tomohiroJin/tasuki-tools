/**
 * Session × RosterPanel 結合テスト
 * T057: FR-046/047/048/050/051/061
 *
 * Session が独自の簡易一覧ではなく RosterPanel を描画し、
 * 改名・一時離脱(driver.skip)・代理追加の操作が正しいハンドラを発火することを検証する。
 * また viewer 在席で participants 配列と rotation がずれても、
 * 現ドライバーが「名前ベース」で正しくハイライトされることを検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";
import { saveNotifyPreferences, loadNotifyPreferences } from "../../src/prefs/local-prefs.js";
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

/** viewer 在席で participants 配列(3件)と rotation(2件)がずれた部屋。
 *  rotation は参加者IDの配列（D6b）。現ドライバーは rotation[currentIndex=1] = Carol(edit-1)。 */
function makeRoom(overrides?: Partial<Room>): Room {
  return aRoomView({
    code: "AA0001",
    hostParticipantId: "host-1",
    config,
    session: { rotation: ["host-1", "edit-1"], currentIndex: 1, driverCounts: [0, 0] },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "view-1", displayName: "Bob", role: "viewer", connId: "c2" }),
      makeParticipant({ participantId: "edit-1", displayName: "Carol", role: "editor", connId: "c3" }),
    ],
    ...overrides,
  });
}

const noop = vi.fn();

function baseHandlers() {
  return {
    onSkip: noop,
    onPause: noop,
    onResume: noop,
    onRestartTimer: noop,
    onComplete: noop,
    onAbort: noop,
    onReset: noop,
    onRenameParticipant: vi.fn(),
    onDriverSkip: vi.fn(),
    onDriverResume: vi.fn(),
    onAddProxy: vi.fn(),
    onDriverAssign: vi.fn(),
  };
}

/**
 * @requirements T057, FR-061, FR-051, FR-046, FR-048, FR-047, v2.3 #1, Issue #13
 */
describe("Session × RosterPanel 結合", () => {
  it("rotation と participants がずれても現ドライバーが識別子ベースで正しくハイライトされる（バグ修正）", () => {
    // Given
    const handlers = baseHandlers();
    // When
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Then（現ドライバー Carol の li に「現在」が付き、viewer Bob には付かない。
    // Carol は rotation 内 → ドライバー一覧、Bob は rotation 外 → 見学一覧 に分かれる）
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const watchList = screen.getByRole("list", { name: "見学一覧" });
    const carolItem = within(driverList).getByText("Carol").closest("li");
    const bobItem = within(watchList).getByText("Bob").closest("li");
    expect(carolItem?.textContent).toMatch(/今/);
    expect(bobItem?.textContent).not.toMatch(/今/);
  });

  it("観覧者に観覧バッジが表示される", () => {
    // Given
    const handlers = baseHandlers();
    // When
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Then
    expect(screen.getByText(/観覧/)).toBeTruthy();
  });

  it("RosterPanel の離脱操作が driver.skip ハンドラを participantId 付きで発火する", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // When（Carol（editor）は rotation 内 → ドライバー一覧に表示される。
    // 「離脱」ボタンを押す。タイマー下の即時交代「スキップ」と混同しない）
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const carolItem = within(driverList).getByText("Carol").closest("li") as HTMLElement;
    const skipBtn = within(carolItem).getByRole("button", { name: /離脱/ });
    fireEvent.click(skipBtn);
    // Then
    expect(handlers.onDriverSkip).toHaveBeenCalledWith("edit-1");
  });

  it("RosterPanel の改名操作が rename ハンドラを発火する", () => {
    // Given（Carol（editor）は rotation 内 → ドライバー一覧に表示される）
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // When
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const carolItem = within(driverList).getByText("Carol").closest("li") as HTMLElement;
    fireEvent.click(within(carolItem).getByRole("button", { name: /改名/ }));
    const input = screen.getByDisplayValue("Carol");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    // Then
    expect(handlers.onRenameParticipant).toHaveBeenCalledWith("edit-1", "Caroline");
  });

  it("RosterPanel の代理追加操作が addProxy ハンドラを発火する", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /代理参加者を追加|代理追加/ }));
    fireEvent.change(screen.getByPlaceholderText(/Web 非接続|offline/i), {
      target: { value: "Dave" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^追加$/ }));
    // Then
    expect(handlers.onAddProxy).toHaveBeenCalledWith("Dave");
  });

  // ─── 現ドライバーの強調（CURRENT DRIVER 見出し）───────────────────────────
  it("現ドライバー名が CURRENT DRIVER 見出しに表示される", () => {
    // Given
    const handlers = baseHandlers();
    // When
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Then（「CURRENT DRIVER」ラベルの直近に現ドライバー（rotation[1]="Carol"）が表示される）
    const label = screen.getByText(/current driver/i);
    const panel = label.closest("div")?.parentElement ?? label.parentElement!;
    expect(panel.textContent).toContain("Carol");
  });

  it("「次」ドライバーが現ドライバーとは別に表示される", () => {
    // Given
    const handlers = baseHandlers();
    // When
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Then（「次:」の近傍に次ドライバー（rotation[0]="Alice"）が出る）
    const nextLabel = screen.getByText(/次:/);
    expect(nextLabel.parentElement?.textContent).toContain("Alice");
  });

  // ─── ランダム・並べ替え ────────────────────────────────────────
  it("ホストには『ランダム』ボタンが表示され、押すとローテーションがランダムに並べ替わる", () => {
    // Given
    const handlers = baseHandlers();
    const onShuffle = vi.fn();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} onShuffle={onShuffle} />);
    // When
    fireEvent.click(screen.getAllByRole("button", { name: /ランダム/ })[0] as HTMLElement);
    // Then
    expect(onShuffle).toHaveBeenCalledTimes(1);
  });

  it("ホストでない（editor）には『ランダム』ボタンを出さない", () => {
    // Given（自分=Carol(editor)。host ではない）
    const handlers = baseHandlers();
    // When
    render(<Session room={makeRoom()} participantId="edit-1" {...handlers} onShuffle={vi.fn()} />);
    // Then
    expect(screen.queryByRole("button", { name: /ランダム/ })).toBeNull();
  });

  it("ホストはロスター行で並べ替えでき、指定した位置へドライバーが移動する", () => {
    // Given
    const handlers = baseHandlers();
    const onMoveRotation = vi.fn();
    render(
      <Session room={makeRoom()} participantId="host-1" {...handlers} onMoveRotation={onMoveRotation} />,
    );
    // When（rotation=[host-1, edit-1]。Carol（index 1）を前の順番へ → move(1, 0)）
    fireEvent.click(screen.getByRole("button", { name: /Carol を前の順番へ/ }));
    // Then
    expect(onMoveRotation).toHaveBeenCalledWith(1, 0);
  });

  it("RosterPanel の指名操作が driver.assign ハンドラを participantId 付きで発火する", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // When（現ドライバーは Carol（currentIndex=1）。Alice（host-1・rotation[0]）は現ドライバーでない
    // → ドライバー一覧の Alice 行に「ドライバーにする」が出る）
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const aliceItem = within(driverList).getByText("Alice").closest("li") as HTMLElement;
    fireEvent.click(within(aliceItem).getByRole("button", { name: /ドライバーにする/ }));
    // Then
    expect(handlers.onDriverAssign).toHaveBeenCalledWith("host-1");
  });
});

describe("Session 初回通知ヒントの自動消滅", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("通知 OFF・未読のとき初回ヒントを表示する", () => {
    // Given
    const handlers = baseHandlers();
    // When
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Then
    expect(screen.getByText(/交代を音で知らせ/)).toBeTruthy();
  });

  it("セッション中に通知を ON にすると初回ヒントが手動 dismiss なしで消える", () => {
    // Given
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    expect(screen.getByText(/交代を音で知らせ/)).toBeTruthy();
    // When（ポップオーバー等から通知 ON 保存→ NOTIFY_CHANGED_EVENT で useNotifyPreferences が再読込→再描画）
    act(() => {
      saveNotifyPreferences({ ...loadNotifyPreferences(), enabled: true });
    });
    // Then
    expect(screen.queryByText(/交代を音で知らせ/)).toBeNull();
  });
});
