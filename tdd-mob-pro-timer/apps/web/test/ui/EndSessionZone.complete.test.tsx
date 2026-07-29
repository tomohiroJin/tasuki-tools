/**
 * 完成にも確認を課す（host-spof-relaxation G5）
 *
 * 開始後は主催者以外も完成を実行できる（G2）。完成はセッションを畳む操作なので
 * 誤操作の影響が全員に及ぶ。ただし中断・リセットと違って**記録は残る**ため、
 * 「何が失われるか」ではなく「記録として締めてよいか」を問う。
 *
 * @requirements FR-074b, FR-076, US4
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

describe("EndSessionZone: 完成の確認", () => {
  it("完成ボタンを押しても即座には完成させない", () => {
    // Given
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    // Then
    expect(h.onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("確認すると完成が記録される", () => {
    // Given
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    // When
    fireEvent.click(within(screen.getByRole("dialog")).getByText("完成として記録する"));
    // Then
    expect(h.onComplete).toHaveBeenCalledTimes(1);
  });

  it("取り消すと完成は記録されない", () => {
    // Given
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    // When
    fireEvent.click(within(screen.getByRole("dialog")).getByText("キャンセル"));
    // Then
    expect(h.onComplete).not.toHaveBeenCalled();
  });

  it("記録が残ることを伝える（中断・リセットとは別の問い）", () => {
    // Given
    render(<EndSessionZone {...handlers()} isShared />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    // Then（「記録は残りません」（中断の文言）を流用していないこと）
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/記録/);
    expect(dialog.textContent).not.toMatch(/記録は残りません/);
  });

  it("共有ルームでは他の参加者への影響を伝える", () => {
    // Given
    render(<EndSessionZone {...handlers()} isShared />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    // Then
    expect(screen.getByRole("dialog").textContent).toMatch(/他の参加者/);
  });

  it("中断は従来どおり確認を挟む（回帰）", () => {
    // Given
    const h = handlers();
    render(<EndSessionZone {...h} isShared />);
    // When
    fireEvent.click(screen.getByRole("button", { name: /途中で終える/ }));
    // Then
    expect(h.onAbort).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").textContent).toMatch(/記録は残りません/);
  });
});
