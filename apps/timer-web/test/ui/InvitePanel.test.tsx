import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvitePanel } from "../../src/ui/components/InvitePanel.js";

describe("InvitePanel", () => {
  it("ルームコードを表示する", () => {
    render(<InvitePanel code="ABC123" />);
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("参加URLコピーで clipboard に公開パス配下の参加 URL を書く", async () => {
    // Given（user-event v14 は setup() 時に navigator.clipboard を独自 stub に
    // 差し替えるため、setup() 後に spyOn で writeText を差し込む）
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<InvitePanel code="ABC123" />);
    // When
    await user.click(screen.getByRole("button", { name: /参加 URL/ }));
    // Then: ルート直下ではなく /timer/ 配下（#76 F-1）。
    // ルート直下だと玄関 LP に着地して参加画面へ行けない。
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/timer/?room=ABC123`,
    );
  });

  it("参加 URL を画面にも出す（コピーが使えない環境で手で拾えるように）", () => {
    // Given: 非セキュアオリジン（LAN の IP 等）では navigator.clipboard が無く、
    // コピーボタンが黙って何もしない。URL が画面に出ていなければ招待できない。
    render(<InvitePanel code="ABC123" />);

    expect(
      screen.getByText(`${window.location.origin}/timer/?room=ABC123`),
    ).toBeInTheDocument();
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
