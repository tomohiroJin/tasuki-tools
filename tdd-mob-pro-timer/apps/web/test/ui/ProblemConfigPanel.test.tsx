/**
 * ProblemConfigPanel（言語/難易度/ランダム言語プール）のテスト。ConfigPanel から分割（v2.9）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ProblemConfigPanel } from "../../src/ui/components/ProblemConfigPanel.js";
import type { SessionConfig } from "@tdd-mob/core";

const config: SessionConfig = { language: "TypeScript", difficulty: "easy", members: ["Alice"], intervalMinutes: 7 };

describe("ProblemConfigPanel", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("problemEnabled のとき言語/難易度の選択肢が表示される", () => {
    render(<ProblemConfigPanel config={config} canEdit onChange={vi.fn()} problemEnabled />);
    expect(screen.getByRole("combobox", { name: "言語" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "難易度" })).toBeTruthy();
  });

  it("言語を変更すると言語設定が更新される", () => {
    // Given
    const onChange = vi.fn();
    render(<ProblemConfigPanel config={config} canEdit onChange={onChange} problemEnabled />);
    // When
    fireEvent.change(screen.getByRole("combobox", { name: "言語" }), { target: { value: "Python" } });
    // Then
    expect(onChange).toHaveBeenCalledWith({ language: "Python" });
  });

  it("難易度を変更すると難易度設定が更新される", () => {
    // Given
    const onChange = vi.fn();
    render(<ProblemConfigPanel config={config} canEdit onChange={onChange} problemEnabled />);
    // When
    fireEvent.change(screen.getByRole("combobox", { name: "難易度" }), { target: { value: "hard" } });
    // Then
    expect(onChange).toHaveBeenCalledWith({ difficulty: "hard" });
  });

  it("言語/難易度のランダムボタンが存在する", () => {
    render(<ProblemConfigPanel config={config} canEdit onChange={vi.fn()} problemEnabled />);
    expect(screen.getByRole("button", { name: "言語をランダムに選ぶ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "難易度をランダムに選ぶ" })).toBeTruthy();
  });

  it("言語ランダムは言語のみ変える（プール先頭・難易度不変）", () => {
    // Given
    vi.spyOn(Math, "random").mockReturnValue(0); // プール先頭 = TypeScript
    const onChange = vi.fn();
    render(<ProblemConfigPanel config={config} canEdit onChange={onChange} problemEnabled />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "言語をランダムに選ぶ" }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ language: "TypeScript" });
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty("difficulty");
  });

  it("プールを空にすると言語ランダムは何も変更しない", () => {
    // Given
    localStorage.setItem("tdd-mob:random-language-pool:v1", JSON.stringify([]));
    const onChange = vi.fn();
    render(<ProblemConfigPanel config={config} canEdit onChange={onChange} problemEnabled />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "言語をランダムに選ぶ" }));
    // Then
    expect(onChange).not.toHaveBeenCalled();
  });

  it("problemEnabled=false のとき言語コンボボックスが描画されない", () => {
    render(<ProblemConfigPanel config={config} canEdit onChange={vi.fn()} problemEnabled={false} />);
    expect(screen.queryByRole("combobox", { name: "言語" })).toBeNull();
  });

  it("canEdit=false では編集要素を出さず現在の言語/難易度を読み取り表示する", () => {
    render(<ProblemConfigPanel config={config} canEdit={false} onChange={vi.fn()} problemEnabled />);
    expect(screen.queryByRole("combobox", { name: "言語" })).toBeNull();
    expect(screen.getByText(/TypeScript/)).toBeTruthy();
  });
});
