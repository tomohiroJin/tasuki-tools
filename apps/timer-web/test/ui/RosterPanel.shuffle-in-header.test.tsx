/**
 * 「ランダム」は参加者の見出しの行の中に置く（#553 一覧 #6・ADR 0035）。
 * 見出しの行の外（直前の独立した帯）に置くと、どの一覧に効く操作か読めない。
 * 見出しの行は部品 `.ui-section-head`（`SectionHeader`）。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import type { Participant } from "@tasuki/timer-core";

const mk = (id: string, name: string): Participant => ({
  participantId: id,
  displayName: name,
  presence: "online",
  driverEligible: true,
  isPlaceholder: false,
  joinedAt: 1000000,
});

const noop = vi.fn();
const baseProps = {
  participants: [mk("p1", "Alice"), mk("p2", "Bob")],
  currentDriverId: "p1",
  myParticipantId: "p1",
  onRename: noop,
  onSkip: noop,
  onResume: noop,
  onAddProxy: noop,
};

describe("RosterPanel の「ランダム」の置き場", () => {
  it("Given onShuffle を渡す / When 描く / Then 「ランダム」は「参加者」の見出しの行（.ui-section-head）の中にある", () => {
    render(<RosterPanel {...baseProps} onShuffle={noop} />);
    const shuffle = screen.getByRole("button", { name: "ドライバー順をランダムに並べ替える" });
    const head = shuffle.closest(".ui-section-head");
    expect(head).not.toBeNull();
    expect(head?.querySelector("h2")?.textContent).toBe("参加者");
  });

  it("Given onShuffle を渡さない / When 描く / Then 「ランダム」は出ない", () => {
    render(<RosterPanel {...baseProps} />);
    expect(screen.queryByRole("button", { name: "ドライバー順をランダムに並べ替える" })).toBeNull();
  });

  it("Given 見出しの行 / When 描く / Then 「代理追加」も同じ行の中にある", () => {
    render(<RosterPanel {...baseProps} onShuffle={noop} />);
    const head = screen.getByRole("button", { name: "代理参加者を追加" }).closest(".ui-section-head");
    expect(head).not.toBeNull();
  });
});
