/**
 * Setup 画面（名前だけ）のテスト
 * UX 再設計（2026-06-03 合意フロー）: 最初の画面は「自分の名前 → ルームを作る」だけ。
 * 言語/難易度/間隔/オプション/お題はルーム作成後の Lobby で選ぶ。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Setup } from "../../src/ui/Setup.js";
import {
  savePreferences,
  loadPreferences,
  clearPreferences,
} from "../../src/prefs/local-prefs.js";

describe("Setup（名前だけのオンボーディング）", () => {
  const noop = vi.fn();
  beforeEach(() => clearPreferences());

  it("名前入力欄と『ルームを作る』ボタンがある（FR-001）", () => {
    render(<Setup onCreateRoom={noop} />);
    expect(screen.getByLabelText(/あなたの名前|名前/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ })).toBeTruthy();
  });

  it("最初の画面に言語/難易度/メンバー入力を出さない（選びすぎ解消）", () => {
    render(<Setup onCreateRoom={noop} />);
    expect(screen.queryByLabelText(/言語/)).toBeNull();
    expect(screen.queryByLabelText(/難易度/)).toBeNull();
    expect(screen.queryByLabelText(/メンバー1の名前/)).toBeNull();
  });

  it("名前が空のときは作成できない", () => {
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    const input = screen.getByLabelText(/あなたの名前|名前/);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    expect(onCreateRoom).not.toHaveBeenCalled();
  });

  it("名前を入れて作成すると onCreateRoom が名前で呼ばれる", () => {
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Tomohiro" } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    expect(onCreateRoom).toHaveBeenCalledWith("Tomohiro");
  });

  it("保存済みの名前が初期値に復元される（FR-054）", () => {
    savePreferences({
      displayName: "Carol",
      language: "Python",
      difficulty: "hard",
      members: ["Carol"],
      intervalMinutes: 10,
    });
    render(<Setup onCreateRoom={noop} />);
    expect((screen.getByLabelText(/あなたの名前|名前/) as HTMLInputElement).value).toBe("Carol");
  });

  it("作成時に名前が savePreferences で保存される（FR-053）", () => {
    render(<Setup onCreateRoom={noop} />);
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Dave" } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    expect(loadPreferences()?.displayName).toBe("Dave");
  });
});
