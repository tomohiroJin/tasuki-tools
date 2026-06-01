/**
 * Session × RosterPanel 結合テスト
 * T057: FR-046/047/048/050/051/061
 *
 * Session が独自の簡易一覧ではなく RosterPanel を描画し、
 * 改名・一時離脱(driver.skip)・代理追加の操作が正しいハンドラを発火することを検証する。
 * また viewer 在席で participants 配列と rotation がずれても、
 * 現ドライバーが「名前ベース」で正しくハイライトされることを検証する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { Session } from "../../src/ui/Session.js";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

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
 *  現ドライバーは rotation[currentIndex=1] = "Carol"。 */
function makeRoom(overrides?: Partial<Room>): Room {
  return {
    code: "AA0001",
    createdAt: 0,
    hostParticipantId: "host-1",
    config,
    problem: null,
    session: {
      rotation: ["Alice", "Carol"],
      currentIndex: 1,
      isPaused: false,
      driverCounts: [0, 0],
      totalSwitches: 0,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "view-1", displayName: "Bob", role: "viewer", connId: "c2" }),
      makeParticipant({ participantId: "edit-1", displayName: "Carol", role: "editor", connId: "c3" }),
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    ...overrides,
  };
}

const noop = vi.fn();

function baseHandlers() {
  return {
    onSkip: noop,
    onPause: noop,
    onResume: noop,
    onComplete: noop,
    onAbort: noop,
    onReset: noop,
    onBreakStart: noop,
    onBreakEnd: noop,
    onRenameParticipant: vi.fn(),
    onDriverSkip: vi.fn(),
    onDriverResume: vi.fn(),
    onAddProxy: vi.fn(),
  };
}

describe("Session × RosterPanel 結合（T057）", () => {
  it("rotation と participants がずれても現ドライバーが名前ベースで正しくハイライトされる（FR-061 バグ修正）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // 現ドライバー Carol の li に「現在」が付き、viewer Bob には付かない。
    // 「Carol」はドライバー見出しにも現れるため在席一覧（list）内に限定して検索する。
    const list = screen.getByRole("list");
    const carolItem = within(list).getByText("Carol").closest("li");
    const bobItem = within(list).getByText("Bob").closest("li");
    expect(carolItem?.textContent).toMatch(/現在/);
    expect(bobItem?.textContent).not.toMatch(/現在/);
  });

  it("観覧者に観覧バッジが表示される（FR-061）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    expect(screen.getByText(/観覧/)).toBeTruthy();
  });

  it("RosterPanel のスキップ操作が driver.skip ハンドラを participantId 付きで発火する（FR-051）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // Carol（editor）の行内のスキップボタンを押す（編集者の SWITCH ボタンと混同しない）
    const list = screen.getByRole("list");
    const carolItem = within(list).getByText("Carol").closest("li") as HTMLElement;
    const skipBtn = within(carolItem).getByRole("button", { name: /スキップ/ });
    fireEvent.click(skipBtn);
    expect(handlers.onDriverSkip).toHaveBeenCalledWith("edit-1");
  });

  it("RosterPanel の改名操作が rename ハンドラを発火する（FR-046/048）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    const list = screen.getByRole("list");
    const carolItem = within(list).getByText("Carol").closest("li") as HTMLElement;
    fireEvent.click(within(carolItem).getByRole("button", { name: /改名/ }));
    const input = screen.getByDisplayValue("Carol");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(handlers.onRenameParticipant).toHaveBeenCalledWith("edit-1", "Caroline");
  });

  it("RosterPanel の代理追加操作が addProxy ハンドラを発火する（FR-047）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: /代理参加者を追加|代理追加/ }));
    fireEvent.change(screen.getByPlaceholderText(/Web 非接続|offline/i), {
      target: { value: "Dave" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^追加$/ }));
    expect(handlers.onAddProxy).toHaveBeenCalledWith("Dave");
  });

  // ─── 現ドライバーのスポットライト強調（S3）─────────────────────────────────
  it("現ドライバー名がスポットライト強調（.driver-spotlight）され、その中身が現ドライバー名である", () => {
    const handlers = baseHandlers();
    const { container } = render(
      <Session room={makeRoom()} participantId="host-1" {...handlers} />,
    );
    // 焦点ゾーンの現ドライバー名にスポットライト用クラスが付く
    const spotlight = container.querySelector(".driver-spotlight");
    expect(spotlight).toBeTruthy();
    // 中身は現ドライバー（rotation[currentIndex=1] = "Carol"）
    expect(spotlight?.textContent).toBe("Carol");
  });

  it("「次」ドライバー名はスポットライト強調されない", () => {
    const handlers = baseHandlers();
    const { container } = render(
      <Session room={makeRoom()} participantId="host-1" {...handlers} />,
    );
    // スポットライトは現ドライバーのみ。次（Alice）の要素には付かない。
    const spotlights = container.querySelectorAll(".driver-spotlight");
    expect(spotlights.length).toBe(1);
    expect(spotlights[0]?.textContent).not.toBe("Alice");
  });
});
