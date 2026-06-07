/**
 * Join 画面（?room= リンクからの参加）のテスト
 * UX 再設計: リンクで来た人は「名前を入れてモブに参加」1画面で参加する（ゲスト自動参加をやめる）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Join } from "../../src/ui/Join.js";
import { clearPreferences, savePreferences } from "../../src/prefs/local-prefs.js";

describe("Join 画面（UX 再設計）", () => {
  beforeEach(() => clearPreferences());

  it("ルームコードと名前入力・参加ボタンを表示する", () => {
    render(<Join code="ABC123" onJoin={vi.fn()} />);
    expect(screen.getByText(/ABC123/)).toBeTruthy();
    expect(screen.getByLabelText(/あなたの名前|名前/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /参加/ })).toBeTruthy();
  });

  it("名前が空のときは参加できない", () => {
    const onJoin = vi.fn();
    render(<Join code="ABC123" onJoin={onJoin} />);
    fireEvent.click(screen.getByRole("button", { name: /参加/ }));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("名前を入れて参加すると onJoin が名前で呼ばれる", () => {
    const onJoin = vi.fn();
    render(<Join code="ABC123" onJoin={onJoin} />);
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: /参加/ }));
    expect(onJoin).toHaveBeenCalledWith("Bob");
  });

  it("保存済みの名前が初期値に復元される", () => {
    savePreferences({
      displayName: "Eve",
      language: "TypeScript",
      difficulty: "easy",
      members: ["Eve"],
      intervalMinutes: 5,
    });
    render(<Join code="ABC123" onJoin={vi.fn()} />);
    expect((screen.getByLabelText(/あなたの名前|名前/) as HTMLInputElement).value).toBe("Eve");
  });
});
