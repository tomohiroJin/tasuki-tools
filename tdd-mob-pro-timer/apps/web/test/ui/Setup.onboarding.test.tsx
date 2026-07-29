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

/**
 * @requirements FR-001, FR-053, FR-054
 */
describe("Setup（名前だけのオンボーディング）", () => {
  const noop = vi.fn();
  beforeEach(() => clearPreferences());

  it("名前入力欄と『ルームを作る』ボタンがある", () => {
    // When
    render(<Setup onCreateRoom={noop} />);
    // Then
    expect(screen.getByLabelText(/あなたの名前|名前/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ })).toBeTruthy();
  });

  it("最初の画面に言語/難易度/メンバー入力を出さない（選びすぎ解消）", () => {
    // When
    render(<Setup onCreateRoom={noop} />);
    // Then
    expect(screen.queryByLabelText(/言語/)).toBeNull();
    expect(screen.queryByLabelText(/難易度/)).toBeNull();
    expect(screen.queryByLabelText(/メンバー1の名前/)).toBeNull();
  });

  it("名前が空のときは作成できない", () => {
    // Given
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    // When
    const input = screen.getByLabelText(/あなたの名前|名前/);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    // Then
    expect(onCreateRoom).not.toHaveBeenCalled();
  });

  it("名前を入れて作成するとルーム名未指定のまま作成が要求される", () => {
    // Given
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    // When
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Tomohiro" } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    // Then（ルーム名は任意（未入力）なので displayName と undefined で渡る）
    expect(onCreateRoom).toHaveBeenCalledWith("Tomohiro", undefined);
  });

  it("ルーム名を入れて作成するとそのルーム名で作成が要求される", () => {
    // Given
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    // When
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Tomohiro" } });
    fireEvent.change(screen.getByLabelText("ルーム名"), { target: { value: "朝会モブ" } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    // Then
    expect(onCreateRoom).toHaveBeenCalledWith("Tomohiro", "朝会モブ");
  });

  it("保存済みの名前が初期値に復元される", () => {
    // Given
    savePreferences({
      displayName: "Carol",
      language: "Python",
      difficulty: "hard",
      members: ["Carol"],
      intervalMinutes: 10,
    });
    // When
    render(<Setup onCreateRoom={noop} />);
    // Then
    expect((screen.getByLabelText(/あなたの名前|名前/) as HTMLInputElement).value).toBe("Carol");
  });

  it("作成時に名前が保存され、次回以降に引き継がれる", () => {
    // Given
    render(<Setup onCreateRoom={noop} />);
    // When
    fireEvent.change(screen.getByLabelText(/あなたの名前|名前/), { target: { value: "Dave" } });
    fireEvent.click(screen.getByRole("button", { name: /ルームを作る|ルームを作成/ }));
    // Then
    expect(loadPreferences()?.displayName).toBe("Dave");
  });
});
