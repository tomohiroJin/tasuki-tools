import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { SharedMemo } from "../../src/ui/components/SharedMemo.js";

describe("SharedMemo 更新の可視化", () => {
  it("note が外部更新されると更新アナウンスが出る", () => {
    // Given
    const { rerender } = render(
      <SharedMemo note="旧" canEdit onCommit={vi.fn()} />,
    );
    // When
    rerender(<SharedMemo note="新しい内容" canEdit onCommit={vi.fn()} />);
    // Then
    expect(screen.getByText("共有メモが更新されました")).toBeTruthy();
  });

  it("自分が commit した同値の更新では更新アナウンスを出さない", () => {
    // Given（編集モードに切り替えて自分の編集を commit する）
    const onCommit = vi.fn();
    const { rerender } = render(
      <SharedMemo note="" canEdit onCommit={onCommit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const ta = screen.getByRole("textbox", { name: "共有メモ" }) as HTMLTextAreaElement;
    act(() => {
      ta.focus();
    });
    fireEvent.change(ta, { target: { value: "自分の編集" } }); // onChange → blur で commit
    fireEvent.blur(ta);
    // When（サーバー snapshot が同値で返ってくる。自己 commit 由来）
    rerender(<SharedMemo note="自分の編集" canEdit onCommit={onCommit} />);
    // Then
    expect(screen.queryByText("共有メモが更新されました")).toBeNull();
  });
});

describe("SharedMemo プレビュー優先", () => {
  it("editor でも内容ありなら初期はプレビュー（textarea は出さない）", () => {
    // Given
    const note = "# ルール\n- 5分で交代";
    // When
    render(<SharedMemo note={note} canEdit onCommit={vi.fn()} />);
    // Then
    expect(screen.queryByRole("textbox", { name: "共有メモ" })).toBeNull();
    expect(screen.getByRole("button", { name: "編集" })).toBeTruthy();
  });

  it("内容が空でも初期はプレビュー（プレースホルダ＋編集ボタン）", () => {
    // Given
    const note = "";
    // When
    render(<SharedMemo note={note} canEdit onCommit={vi.fn()} />);
    // Then
    expect(screen.queryByRole("textbox", { name: "共有メモ" })).toBeNull();
    expect(screen.getByRole("button", { name: "編集" })).toBeTruthy();
  });

  it("「編集」を押すと textarea が出る", () => {
    // Given
    render(<SharedMemo note="" canEdit onCommit={vi.fn()} />);
    // When（fireEvent で act() ラップを確実にして状態更新を反映させる）
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    // Then
    expect(screen.getByRole("textbox", { name: "共有メモ" })).toBeTruthy();
  });
});
