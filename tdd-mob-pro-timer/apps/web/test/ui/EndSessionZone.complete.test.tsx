/**
 * 完成にも確認を課す（host-spof-relaxation G5・T034）
 *
 * 開始後は主催者以外も完成を実行できる（G2）。完成はセッションを畳む操作なので
 * 誤操作の影響が全員に及ぶ。ただし中断・リセットと違って**記録は残る**ため、
 * 「何が失われるか」ではなく「記録として締めてよいか」を問う。
 *
 * 要件: FR-074b, US4
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { EndSessionZone } from "../../src/ui/components/EndSessionZone.js";

const handlers = () => ({
  onComplete: vi.fn(),
  onAbort: vi.fn(),
  onReset: vi.fn(),
});

describe("EndSessionZone: 完成の確認（T034）", () => {
  it("完成ボタンを押しても即座には完成させない", () => {
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);

    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    expect(h.onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("確認すると onComplete が発火する", () => {
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    fireEvent.click(within(screen.getByRole("dialog")).getByText("完成として記録する"));

    expect(h.onComplete).toHaveBeenCalledTimes(1);
  });

  it("取り消すと onComplete は発火しない", () => {
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    fireEvent.click(within(screen.getByRole("dialog")).getByText("キャンセル"));

    expect(h.onComplete).not.toHaveBeenCalled();
  });

  it("記録が残ることを伝える（中断・リセットとは別の問い）", () => {
    render(<EndSessionZone {...handlers()} isShared />);

    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/記録/);
    // 「記録は残りません」（中断の文言）を流用していないこと。
    expect(dialog.textContent).not.toMatch(/記録は残りません/);
  });

  it("共有ルームでは他の参加者への影響を伝える（FR-076）", () => {
    render(<EndSessionZone {...handlers()} isShared />);

    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    expect(screen.getByRole("dialog").textContent).toMatch(/他の参加者/);
  });

  it("中断は従来どおり確認を挟む（回帰）", () => {
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);

    fireEvent.click(screen.getByRole("button", { name: /途中で終える/ }));

    expect(h.onAbort).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").textContent).toMatch(/記録は残りません/);
  });
});
