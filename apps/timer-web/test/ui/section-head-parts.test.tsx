/**
 * 見出しと操作の行が部品 `.ui-section-head`（と、操作を見出しの隣へ寄せる `--beside`）を使うこと（#553・ADR 0035）。
 * 配置そのもの（広い幅で操作が反対の端へ離れない・折り返したら左端そろい）は E2E（`e2e/specs/spacing.spec.ts`）が測る。
 * ここは、画面がその部品を当てていることを、描いた結果から確かめる。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Users } from "lucide-react";
import { SectionHeader } from "../../src/ui/primitives.js";
import { SharedMemo } from "../../src/ui/components/SharedMemo.js";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import { ShuffleButton } from "../../src/ui/components/ShuffleButton.js";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Participant } from "@tasuki/timer-core";
import { aRoomView } from "../support/room-view.js";

const rowOf = (el: HTMLElement): HTMLElement => el.closest(".ui-section-head") as HTMLElement;

describe("SectionHeader", () => {
  it("Given 既定 / When 描く / Then 行は .ui-section-head で、--beside は付かない", () => {
    render(<SectionHeader icon={Users} title="見出し" />);
    const row = rowOf(screen.getByRole("heading", { name: "見出し" }));
    expect(row).not.toBeNull();
    expect(row.classList.contains("ui-section-head--beside")).toBe(false);
  });

  it("Given beside / When 描く / Then 行に .ui-section-head--beside が付く", () => {
    render(<SectionHeader icon={Users} title="見出し" beside />);
    expect(rowOf(screen.getByRole("heading", { name: "見出し" })).classList.contains("ui-section-head--beside")).toBe(true);
  });
});

describe("共有メモ", () => {
  it("Given 描く / Then 見出しの行は .ui-section-head で、「編集」はその行の中にある", () => {
    render(<SharedMemo note="" onCommit={vi.fn()} />);
    const row = rowOf(screen.getByRole("heading", { name: /共有メモ/ }));
    expect(row).not.toBeNull();
    expect(row.contains(screen.getByRole("button", { name: "編集" }))).toBe(true);
  });
});

const p = (o: Partial<Participant>): Participant => ({ participantId: "x", displayName: "X", presence: "online", joinedAt: 1, ...o });
const noop = vi.fn();

describe("名簿とロビーの参加者の見出しの行", () => {
  it("Given 名簿 / When 描く / Then 見出しの行は --beside（操作を見出しの隣へ寄せる）で、代理追加がその中にある", () => {
    render(
      <RosterPanel participants={[p({ participantId: "p1", displayName: "A" })]} currentDriverId="p1" myParticipantId="p1" onRename={noop} onSkip={noop} onResume={noop} onAddProxy={noop} />,
    );
    const row = rowOf(screen.getByRole("heading", { name: "参加者" }));
    expect(row.classList.contains("ui-section-head--beside")).toBe(true);
    expect(row.contains(screen.getByRole("button", { name: "代理参加者を追加" }))).toBe(true);
  });

  it("Given ロビー / When 描く / Then 見出しの行は --beside", () => {
    const room = aRoomView({
      code: "AA0001",
      config: { intervalMinutes: 5 },
      memberNames: ["Alice"],
      clock: { running: false, runningSince: 0 },
      phase: "ready",
      participants: [p({ participantId: "creator-p", displayName: "Alice" })],
    });
    render(<Lobby room={room} participantId="creator-p" onStartSession={noop} />);
    expect(rowOf(screen.getByRole("heading", { name: /^参加者/ })).classList.contains("ui-section-head--beside")).toBe(true);
  });
});

describe("ShuffleButton", () => {
  it("Given 2 人 / When 描く / Then ボタンの中の並びは session-action-label・session-action-icon（セッションの操作ボタンと同じクラス。写しを持たない）", () => {
    const { container } = render(<ShuffleButton onClick={noop} rotationLength={2} />);
    expect(container.querySelector(".session-action-label")).not.toBeNull();
    expect(container.querySelector(".session-action-icon")).not.toBeNull();
    expect(container.querySelector("[class*='shuffle-button-']")).toBeNull();
  });

  it("Given 1 人・または onClick が無い / When 描く / Then 何も描かない", () => {
    expect(render(<ShuffleButton onClick={noop} rotationLength={1} />).container.firstChild).toBeNull();
    expect(render(<ShuffleButton onClick={undefined} rotationLength={3} />).container.firstChild).toBeNull();
  });
});
