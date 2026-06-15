/**
 * ソロモード × RosterPanel の結合テスト
 * 項目4: buildSoloRoom が生成する全メンバーの Participant を RosterPanel に渡すと、
 * 現ドライバー（Bob）がハイライトされ、members[1] の改名/skip が発火する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { initialAggregate } from "@tdd-mob/core";
import type { SessionConfig } from "@tdd-mob/core";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import { buildSoloRoom, soloMemberId } from "../../src/solo/roster.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob"],
  intervalMinutes: 5,
};

/** currentIndex を指定して soloRoom を組み立てる（差分なし） */
function soloRoom(currentIndex: number) {
  const agg = initialAggregate(config);
  return buildSoloRoom({
    config,
    engineSession: { ...agg.session, currentIndex },
    clock: agg.clock,
    createdAt: 0,
    overrides: { renames: {}, skips: new Set<string>(), proxies: [] },
    problem: null,
  });
}

describe("ソロ × RosterPanel（項目4）", () => {
  const noop = vi.fn();

  it("ソロ 2 名で現ドライバーが Bob のとき RosterPanel で Bob がハイライトされる", () => {
    const room = soloRoom(1); // Bob が現ドライバー
    render(
      <RosterPanel
        participants={room.participants}
        currentDriverName={room.session.rotation[room.session.currentIndex] ?? ""}
        myParticipantId="solo"
        canHostAction
        onRename={noop}
        onSkip={noop}
        onResume={noop}
        onAddProxy={noop}
      />,
    );
    const bobItem = screen.getByText("Bob").closest("li");
    const aliceItem = screen.getByText("Alice").closest("li");
    expect(bobItem?.textContent).toMatch(/今/);
    expect(aliceItem?.textContent).not.toMatch(/今/);
  });

  it("ソロで members[1]（Bob）を skip すると onSkip がその participantId で呼ばれる", () => {
    const onSkip = vi.fn();
    const room = soloRoom(0);
    render(
      <RosterPanel
        participants={room.participants}
        currentDriverName={room.session.rotation[0] ?? ""}
        myParticipantId="solo"
        canHostAction
        onRename={noop}
        onSkip={onSkip}
        onResume={noop}
        onAddProxy={noop}
      />,
    );
    const bobItem = screen.getByText("Bob").closest("li") as HTMLElement;
    fireEvent.click(within(bobItem).getByRole("button", { name: /離脱/ }));
    expect(onSkip).toHaveBeenCalledWith(soloMemberId(1));
  });

  it("ソロで members[1]（Bob）を改名すると onRename がその participantId で呼ばれる", () => {
    const onRename = vi.fn();
    const room = soloRoom(0);
    render(
      <RosterPanel
        participants={room.participants}
        currentDriverName={room.session.rotation[0] ?? ""}
        myParticipantId="solo"
        canHostAction
        onRename={onRename}
        onSkip={noop}
        onResume={noop}
        onAddProxy={noop}
      />,
    );
    const bobItem = screen.getByText("Bob").closest("li") as HTMLElement;
    fireEvent.click(within(bobItem).getByRole("button", { name: /改名/ }));
    const input = screen.getByDisplayValue("Bob");
    fireEvent.change(input, { target: { value: "Bobby" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(onRename).toHaveBeenCalledWith(soloMemberId(1), "Bobby");
  });
});
