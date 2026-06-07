/**
 * ConfigPanel（ロビーのセッション設定パネル）のテスト
 * UX 再設計: 言語/難易度/交代間隔 + 詳細設定(ナビ/強い通知/休憩) をロビーで host が決める。
 * 変更は config.set 相当の onChange(patch) で通知する。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ConfigPanel } from "../../src/ui/components/ConfigPanel.js";
import type { SessionConfig } from "@tdd-mob/core";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice"],
  intervalMinutes: 5,
};

describe("ConfigPanel（ロビー設定・UX 再設計）", () => {
  it("canEdit のとき言語/難易度/交代間隔の選択肢が表示される", () => {
    render(<ConfigPanel config={config} canEdit onChange={vi.fn()} />);
    expect(screen.getByLabelText(/言語/)).toBeTruthy();
    expect(screen.getByLabelText(/難易度/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /交代間隔/ })).toBeTruthy();
  });

  it("言語を変更すると onChange({language}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/言語/), { target: { value: "Python" } });
    expect(onChange).toHaveBeenCalledWith({ language: "Python" });
  });

  it("交代間隔ボタンで onChange({intervalMinutes}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "10分" }));
    expect(onChange).toHaveBeenCalledWith({ intervalMinutes: 10 });
  });

  it("詳細設定のナビゲータートグルで onChange({navigatorEnabled:true}) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /ナビゲーター/ }));
    expect(onChange).toHaveBeenCalledWith({ navigatorEnabled: true });
  });

  it("休憩リマインダ ON で正の整数、OFF で 0 を送る", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    expect(onChange).toHaveBeenCalledWith({ breakEveryRotations: expect.any(Number) });
    expect(onChange.mock.calls.at(-1)?.[0].breakEveryRotations).toBeGreaterThanOrEqual(1);
    // ON 済みの状態から OFF にすると 0
    onChange.mockClear();
    rerender(<ConfigPanel config={{ ...config, breakEveryRotations: 4 }} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    expect(onChange).toHaveBeenCalledWith({ breakEveryRotations: 0 });
  });

  it("canEdit=false では編集要素を出さず現在の設定を読み取り表示する", () => {
    render(<ConfigPanel config={config} canEdit={false} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/言語/)).toBeNull();
    // 現在値（言語・難易度）はテキストで読める
    expect(screen.getByText(/TypeScript/)).toBeTruthy();
  });

  it("『ランダム』で言語と難易度の両方が onChange に渡る（③ 復活）", () => {
    const onChange = vi.fn();
    render(<ConfigPanel config={config} canEdit onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /ランダム/ }));
    const patch = onChange.mock.calls.at(-1)?.[0];
    expect(patch).toHaveProperty("language");
    expect(patch).toHaveProperty("difficulty");
  });
});
