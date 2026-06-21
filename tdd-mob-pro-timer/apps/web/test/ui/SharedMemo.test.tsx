import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SharedMemo } from "../../src/ui/components/SharedMemo.js";

describe("SharedMemo プレビュー優先", () => {
  it("editor でも内容ありなら初期はプレビュー（textarea は出さない）", () => {
    render(<SharedMemo note={"# ルール\n- 5分で交代"} canEdit onCommit={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "共有メモ" })).toBeNull();
    expect(screen.getByRole("button", { name: "編集" })).toBeTruthy();
  });

  it("内容が空でも初期はプレビュー（プレースホルダ＋編集ボタン）", () => {
    render(<SharedMemo note="" canEdit onCommit={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "共有メモ" })).toBeNull();
    expect(screen.getByRole("button", { name: "編集" })).toBeTruthy();
  });

  it("「編集」を押すと textarea が出る", () => {
    render(<SharedMemo note="" canEdit onCommit={vi.fn()} />);
    // fireEvent で act() ラップを確実にして状態更新を反映させる
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByRole("textbox", { name: "共有メモ" })).toBeTruthy();
  });
});
