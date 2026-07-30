/**
 * SessionConfigPanel（交代間隔＋詳細設定）のテスト。ConfigPanel から分割（v2.9）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SessionConfigPanel } from "../../src/ui/components/SessionConfigPanel.js";
import type { SessionConfig } from "@tdd-mob/core";

const config: SessionConfig = { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 7 };

describe("SessionConfigPanel", () => {
  it("canEdit のとき交代間隔グループが表示される", () => {
    render(<SessionConfigPanel config={config} canEdit onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: /交代間隔/ })).toBeTruthy();
  });

  it("交代間隔ボタンを押すと交代間隔が変更される", () => {
    // Given
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} canEdit onChange={onChange} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "10分" }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ intervalMinutes: 10 });
  });

  it("詳細設定のナビゲータートグルを押すとナビゲーター機能が有効になる", () => {
    // Given
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} canEdit onChange={onChange} />);
    // When
    fireEvent.click(screen.getByRole("checkbox", { name: /ナビゲーター/ }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ navigatorEnabled: true });
  });

  it("休憩リマインダが存在しない", () => {
    render(<SessionConfigPanel config={config} canEdit onChange={vi.fn()} />);
    expect(screen.queryByText(/休憩リマインダ/)).toBeNull();
  });

  it("canEdit=false では間隔ボタンを出さず現在値を読み取り表示する", () => {
    // Given
    const canEdit = false;
    // When
    render(<SessionConfigPanel config={config} canEdit={canEdit} onChange={vi.fn()} />);
    // Then
    expect(screen.queryByRole("group", { name: /交代間隔/ })).toBeNull();
    expect(screen.getByText(/7分/)).toBeTruthy();
  });
});
