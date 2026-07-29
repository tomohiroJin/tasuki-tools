import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "../../src/ui/components/Tabs.js";

const items = [
  { id: "room", label: "ルーム", content: <p>room-panel</p> },
  { id: "opts", label: "お題", content: <p>opts-panel</p> },
];

describe("Tabs", () => {
  it("既定で最初のタブが選択され、そのパネルだけ見える", () => {
    // Given（items をそのまま使う）
    // When
    render(<Tabs items={items} ariaLabel="ロビー" />);
    // Then
    expect(screen.getByRole("tab", { name: "ルーム" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("room-panel")).toBeInTheDocument();
    expect(screen.queryByText("opts-panel")).not.toBeInTheDocument();
  });

  it("タブをクリックすると対応パネルに切り替わる", async () => {
    // Given
    const user = userEvent.setup();
    render(<Tabs items={items} ariaLabel="ロビー" />);
    // When
    await user.click(screen.getByRole("tab", { name: "お題" }));
    // Then
    expect(screen.getByText("opts-panel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "お題" })).toHaveAttribute("aria-selected", "true");
  });

  it("矢印キーでタブ間を移動できる（WAI-ARIA）", async () => {
    // Given
    const user = userEvent.setup();
    render(<Tabs items={items} ariaLabel="ロビー" />);
    const first = screen.getByRole("tab", { name: "ルーム" });
    first.focus();
    // When
    await user.keyboard("{ArrowRight}");
    // Then
    expect(screen.getByRole("tab", { name: "お題" })).toHaveAttribute("aria-selected", "true");
  });

  it("defaultTabId で初期タブを指定できる", () => {
    // When
    render(<Tabs items={items} ariaLabel="ロビー" defaultTabId="opts" />);
    // Then
    expect(screen.getByText("opts-panel")).toBeInTheDocument();
  });

  it("矢印キーでフォーカスも次タブへ移る（focus follows selection）", async () => {
    // Given
    const user = userEvent.setup();
    render(<Tabs items={items} ariaLabel="ロビー" />);
    const first = screen.getByRole("tab", { name: "ルーム" });
    first.focus();
    // When
    await user.keyboard("{ArrowRight}");
    // Then
    expect(screen.getByRole("tab", { name: "お題" })).toHaveFocus();
  });
});
