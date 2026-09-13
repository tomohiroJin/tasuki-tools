import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvitePanel } from "../../src/ui/components/InvitePanel.js";

/**
 * 参加用 URL は**同期フックが組み立てて渡す**（#95 S5b）。
 * 形そのもの（ルート直下の `?room=`）を見るのは `test/ui/room-url.test.ts` と
 * 同期フックの検査で、ここが見るのは「受け取った URL を配るか」である。
 */
const ROOM_URL = `${window.location.origin}/?room=ABC123`;

describe("InvitePanel", () => {
  it("ルームコードを表示する", () => {
    render(<InvitePanel code="ABC123" roomUrl={ROOM_URL} />);
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("参加URLコピーで clipboard に玄関の参加 URL を書く", async () => {
    // Given（user-event v14 は setup() 時に navigator.clipboard を独自 stub に
    // 差し替えるため、setup() 後に spyOn で writeText を差し込む）
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<InvitePanel code="ABC123" roomUrl={ROOM_URL} />);
    // When
    await user.click(screen.getByRole("button", { name: /参加 URL/ }));
    // Then: 受け取った URL をそのまま書く
    expect(writeText).toHaveBeenCalledWith(ROOM_URL);
  });

  it("参加 URL を画面にも出す（コピーが使えない環境で手で拾えるように）", () => {
    // Given: 非セキュアオリジン（LAN の IP 等）では navigator.clipboard が無く、
    // コピーボタンが黙って何もしない
    // When: 招待パネルを表示する
    render(<InvitePanel code="ABC123" roomUrl={ROOM_URL} />);

    // Then: URL が画面に出ており、手で選んで拾える
    expect(screen.getByText(ROOM_URL)).toBeInTheDocument();
  });

  it("ルームコードのコピーもできる", async () => {
    // Given
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<InvitePanel code="ABC123" roomUrl={ROOM_URL} />);
    // When
    await user.click(screen.getByRole("button", { name: "ルームコードをコピー" }));
    // Then
    expect(writeText).toHaveBeenCalledWith("ABC123");
  });
});
