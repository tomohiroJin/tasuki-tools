import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvitePanel } from "../../src/ui/components/InvitePanel.js";

describe("InvitePanel", () => {
  it("ルームコードを表示する", () => {
    render(<InvitePanel code="ABC123" />);
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("参加URLコピーで clipboard に origin?room=code を書く", async () => {
    // Given（user-event v14 は setup() 時に navigator.clipboard を独自 stub に
    // 差し替えるため、setup() 後に spyOn で writeText を差し込む）
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<InvitePanel code="ABC123" />);
    // When
    await user.click(screen.getByRole("button", { name: /参加 URL/ }));
    // Then
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}?room=ABC123`,
    );
  });

  it("ルームコードのコピーもできる", async () => {
    // Given
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<InvitePanel code="ABC123" />);
    // When
    await user.click(screen.getByRole("button", { name: "ルームコードをコピー" }));
    // Then
    expect(writeText).toHaveBeenCalledWith("ABC123");
  });
});
