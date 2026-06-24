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

  it("交代間隔ボタンで onChange({intervalMinutes}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "10分" }));
    expect(onChange).toHaveBeenCalledWith({ intervalMinutes: 10 });
  });

  it("詳細設定のナビゲータートグルで onChange({navigatorEnabled:true}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<SessionConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /ナビゲーター/ }));
    expect(onChange).toHaveBeenCalledWith({ navigatorEnabled: true });
  });

  it("休憩リマインダ ON で正の整数、OFF で 0 を送る", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SessionConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    expect(onChange).toHaveBeenCalledWith({ breakEveryRotations: expect.any(Number) });
    onChange.mockClear();
    rerender(<SessionConfigPanel config={{ ...config, breakEveryRotations: 4 }} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    expect(onChange).toHaveBeenCalledWith({ breakEveryRotations: 0 });
  });

  it("canEdit=false では間隔ボタンを出さず現在値を読み取り表示する", () => {
    render(<SessionConfigPanel config={config} canEdit={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("group", { name: /交代間隔/ })).toBeNull();
    expect(screen.getByText(/7分/)).toBeTruthy();
  });
});
