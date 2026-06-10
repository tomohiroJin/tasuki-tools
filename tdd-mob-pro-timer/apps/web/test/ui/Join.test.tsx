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
    // パスフレーズ未入力時は空文字で渡す（未設定ルームを壊さない）。
    expect(onJoin).toHaveBeenCalledWith("Bob", "");
  });

  it("パスフレーズを入力して参加すると onJoin に passphrase が渡る", () => {
    const onJoin = vi.fn();
    render(<Join code="ABC123" onJoin={onJoin} />);
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Bob" } });
    fireEvent.change(screen.getByLabelText(/パスフレーズ/), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /参加/ }));
    expect(onJoin).toHaveBeenCalledWith("Bob", "secret");
  });

  it("パスフレーズ入力欄を表示する（type=password・任意）", () => {
    render(<Join code="ABC123" onJoin={vi.fn()} />);
    const input = screen.getByLabelText(/パスフレーズ/) as HTMLInputElement;
    expect(input.type).toBe("password");
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
