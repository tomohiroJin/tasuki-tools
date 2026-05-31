/**
 * RosterPanel コンポーネントのテスト
 * T056/T057: FR-046,047,048,050,051,052,061 (US9)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import type { Participant } from "@tdd-mob/core";

function makeParticipant(overrides?: Partial<Participant>): Participant {
  return {
    participantId: "p1",
    connId: "conn1",
    displayName: "Alice",
    role: "host",
    presence: "online",
    hasAiKey: false,
    joinedAt: 1000000,
    ...overrides,
  };
}

describe("RosterPanel（T056/T057）", () => {
  const noop = vi.fn();
  const baseProps = {
    participants: [
      makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "p2", displayName: "Bob", role: "editor", connId: "conn2" }),
    ],
    currentDriverIndex: 0,
    myParticipantId: "p1",
    canHostAction: true,
    onRename: noop,
    onSkip: noop,
    onResume: noop,
    onAddProxy: noop,
  };

  it("全参加者の名前が表示される（FR-052）", () => {
    render(<RosterPanel {...baseProps} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("在席状態がテキストで表示される（色＋テキスト併記: FR-050/032）", () => {
    render(<RosterPanel {...baseProps} />);
    expect(screen.getAllByText(/オンライン|online|Online/i).length).toBeGreaterThan(0);
  });

  it("プレースホルダー参加者に代理バッジが表示される（FR-047）", () => {
    const withProxy = [
      ...baseProps.participants,
      makeParticipant({
        participantId: "proxy-1",
        displayName: "Dave",
        connId: null,
        isPlaceholder: true,
      }),
    ];
    render(<RosterPanel {...baseProps} participants={withProxy} />);
    // 「代理 (Proxy)」バッジが少なくとも1つあること
    expect(screen.getAllByText(/代理/i).length).toBeGreaterThan(0);
  });

  it("観覧者に観覧バッジが表示される（FR-061）", () => {
    const withViewer = [
      ...baseProps.participants,
      makeParticipant({
        participantId: "viewer-1",
        displayName: "Carol",
        role: "viewer",
      }),
    ];
    render(<RosterPanel {...baseProps} participants={withViewer} />);
    expect(screen.getByText(/観覧|Viewer|viewer/i)).toBeTruthy();
  });

  it("代理追加ボタンが表示され、フォームに名前を入力して追加すると onAddProxy が呼ばれる（FR-047）", () => {
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} onAddProxy={onAddProxy} />);
    // 「代理追加」ボタンを押してフォームを開く（aria-label で検索）
    const addBtn = screen.getByRole("button", { name: /代理参加者を追加|代理追加/i });
    fireEvent.click(addBtn);
    // 名前を入力して追加
    const input = screen.getByPlaceholderText(/Web 非接続|offline/i);
    fireEvent.change(input, { target: { value: "Dave" } });
    const submitBtn = screen.getByRole("button", { name: /^追加$/ });
    fireEvent.click(submitBtn);
    expect(onAddProxy).toHaveBeenCalledWith("Dave");
  });

  it("一時離脱中の参加者に離脱バッジが表示される（FR-051）", () => {
    const withSkipped = [
      ...baseProps.participants,
      makeParticipant({
        participantId: "p3",
        displayName: "Eve",
        driverEligible: false,
      }),
    ];
    render(<RosterPanel {...baseProps} participants={withSkipped} />);
    // 「離脱中 (skip)」バッジが少なくとも1つあること
    expect(screen.getAllByText(/離脱中/i).length).toBeGreaterThan(0);
  });
});
