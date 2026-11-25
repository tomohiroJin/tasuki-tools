/**
 * SessionConfigPanel（交代間隔＋詳細設定）のテスト。ConfigPanel から分割（v2.9）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SessionConfigPanel } from "../../src/ui/components/SessionConfigPanel.js";
import type { SessionConfig } from "@tasuki/timer-core";

const config: SessionConfig = { intervalMinutes: 7 };

describe("SessionConfigPanel", () => {
  it("交代間隔グループが表示される", () => {
    render(<SessionConfigPanel config={config} eligibleSeats={1} onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: /交代間隔/ })).toBeTruthy();
  });

  it("交代間隔ボタンを押すと交代間隔が変更される", () => {
    // Given
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} eligibleSeats={1} onChange={onChange} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "10分" }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ intervalMinutes: 10 });
  });

  it("詳細設定のナビゲータートグルを押すとナビゲーター機能が有効になる", () => {
    // Given
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} eligibleSeats={1} onChange={onChange} />);
    // When
    fireEvent.click(screen.getByRole("checkbox", { name: /ナビゲーター/ }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ navigatorEnabled: true });
  });

  it("ランダム交代のトグルを押すと、交代先の決め方がランダムになる（#660）", () => {
    // Given（設定に rotationMode が無い = 輪の順）
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} eligibleSeats={1} onChange={onChange} />);
    const toggle = screen.getByRole("checkbox", { name: /ランダム/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    // When
    fireEvent.click(toggle);
    // Then
    expect(onChange).toHaveBeenCalledWith({ rotationMode: "random" });
  });

  it("ランダム交代のルームでは、トグルが入っていて、押すと輪の順に戻る（#660）", () => {
    // Given
    const onChange = vi.fn();
    render(<SessionConfigPanel config={{ ...config, rotationMode: "random" }} eligibleSeats={1} onChange={onChange} />);
    const toggle = screen.getByRole("checkbox", { name: /ランダム/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    // When
    fireEvent.click(toggle);
    // Then
    expect(onChange).toHaveBeenCalledWith({ rotationMode: "order" });
  });

  it("輪の順と明示されたルームでは、ランダム交代のトグルは入っていない（#660）", () => {
    render(<SessionConfigPanel config={{ ...config, rotationMode: "order" }} eligibleSeats={1} onChange={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: /ランダム/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("休憩リマインダが存在しない", () => {
    render(<SessionConfigPanel config={config} eligibleSeats={1} onChange={vi.fn()} />);
    expect(screen.queryByText(/休憩リマインダ/)).toBeNull();
  });
});
