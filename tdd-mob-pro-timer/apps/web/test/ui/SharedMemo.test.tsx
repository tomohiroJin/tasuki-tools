import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { SharedMemo } from "../../src/ui/components/SharedMemo.js";

describe("SharedMemo 更新の可視化", () => {
  it("note が外部更新されると更新アナウンスが出る", () => {
    const { rerender } = render(
      <SharedMemo note="旧" canEdit onCommit={vi.fn()} />,
    );
    rerender(<SharedMemo note="新しい内容" canEdit onCommit={vi.fn()} />);
    expect(screen.getByText("共有メモが更新されました")).toBeTruthy();
  });

  it("自分が commit した同値の更新では更新アナウンスを出さない", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <SharedMemo note="" canEdit onCommit={onCommit} />,
    );
    // 編集モードに切り替え
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const ta = screen.getByRole("textbox", { name: "共有メモ" }) as HTMLTextAreaElement;
    act(() => {
      ta.focus();
    });
    // onChange → blur で commit
    fireEvent.change(ta, { target: { value: "自分の編集" } });
    fireEvent.blur(ta);
    // サーバー snapshot が同値で返ってくる（自己 commit 由来）
    rerender(<SharedMemo note="自分の編集" canEdit onCommit={onCommit} />);
    expect(screen.queryByText("共有メモが更新されました")).toBeNull();
  });
});

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
