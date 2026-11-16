/**
 * RosterPanel から行（RosterRow）への操作の配線（#595。行を別コンポーネントへ分けたので、押した操作が
 * 押した行の参加者 ID で正しいコールバックに届くことを固定する）。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import type { Participant } from "@tasuki/timer-core";

const mk = (id: string, name: string, over: Partial<Participant> = {}): Participant => ({
  participantId: id,
  displayName: name,
  presence: "online",
  driverEligible: true,
  isPlaceholder: false,
  joinedAt: 1000000,
  ...over,
});

function renderPanel(handlers: Partial<Record<"onSkip" | "onResume" | "onMove" | "onAssignDriver" | "onRename", ReturnType<typeof vi.fn>>>) {
  const participants = [mk("a", "Alice"), mk("b", "Bob"), mk("c", "Carol", { driverEligible: false })];
  render(
    <RosterPanel
      participants={participants}
      currentDriverId="a"
      myParticipantId="x"
      rotation={["a", "b", "c"]}
      onRename={handlers.onRename ?? vi.fn()}
      onSkip={handlers.onSkip ?? vi.fn()}
      onResume={handlers.onResume ?? vi.fn()}
      onAddProxy={vi.fn()}
      onMove={handlers.onMove}
      onAssignDriver={handlers.onAssignDriver}
    />,
  );
}

describe("RosterPanel の行の操作の配線", () => {
  it("一時離脱は押した行の参加者 ID で onSkip を呼ぶ", () => {
    const onSkip = vi.fn();
    const onResume = vi.fn();
    renderPanel({ onSkip, onResume });
    fireEvent.click(screen.getByRole("button", { name: "Bob を一時離脱させる" }));
    expect(onSkip).toHaveBeenCalledWith("b");
    expect(onResume).not.toHaveBeenCalled();
  });

  it("復帰は押した行の参加者 ID で onResume を呼ぶ（onSkip は呼ばない）", () => {
    const onSkip = vi.fn();
    const onResume = vi.fn();
    renderPanel({ onSkip, onResume });
    fireEvent.click(screen.getByRole("button", { name: "Carol を復帰させる" }));
    expect(onResume).toHaveBeenCalledWith("c");
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("ドライバーにするは押した行の参加者 ID で onAssignDriver を呼ぶ", () => {
    const onAssignDriver = vi.fn();
    renderPanel({ onAssignDriver });
    fireEvent.click(screen.getByRole("button", { name: "Bob をドライバーにする" }));
    expect(onAssignDriver).toHaveBeenCalledWith("b");
  });

  it("並べ替えは rotation 内の位置で onMove を呼ぶ", () => {
    const onMove = vi.fn();
    renderPanel({ onMove });
    fireEvent.click(screen.getByRole("button", { name: "Bob を前の順番へ" }));
    expect(onMove).toHaveBeenCalledWith(1, 0);
    fireEvent.click(screen.getByRole("button", { name: "Bob を後の順番へ" }));
    expect(onMove).toHaveBeenCalledWith(1, 2);
  });

  it("改名は押した行の参加者 ID と入力した名前で onRename を呼ぶ", () => {
    const onRename = vi.fn();
    renderPanel({ onRename });
    fireEvent.click(screen.getByRole("button", { name: "Bob を改名" }));
    const input = screen.getByLabelText("Bob の新しい名前");
    fireEvent.change(input, { target: { value: "Robert" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onRename).toHaveBeenCalledWith("b", "Robert");
  });
});
