/**
 * Setup 画面のオンボーディング導線テスト
 * T043/T044: FR-001,002,003 (US1)
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

describe("Setup オンボーディング（T043/T044）", () => {
  const noop = vi.fn();

  beforeEach(() => clearPreferences());

  it("画面を開いた際に主要アクション（ルーム作成）が一目で分かる（FR-001）", () => {
    render(<Setup onCreateRoom={noop} />);
    // 主要アクションボタンが少なくとも1つある
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("既定値のまま（追加入力なし）で開始操作を行えること（FR-002）", () => {
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    // ルーム作成ボタンを押す（既定値のまま追加入力不要）
    const createBtn = screen.getByRole("button", { name: /ルームを作成|create|room/i });
    fireEvent.click(createBtn);
    // コールバックが呼ばれる（= 入力エラーで止まらない）
    expect(onCreateRoom).toHaveBeenCalledOnce();
  });

  it("既定値で送信したとき渡る config に language と members が含まれる（FR-002）", () => {
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    const createBtn = screen.getByRole("button", { name: /ルームを作成|create|room/i });
    fireEvent.click(createBtn);
    const config = onCreateRoom.mock.calls[0]?.[0];
    expect(config).toBeTruthy();
    expect(config.language).toBeTruthy();
    expect(config.members.length).toBeGreaterThanOrEqual(2);
  });

  it("メンバー名が重複したときエラーを表示する（FR-003）", () => {
    render(<Setup onCreateRoom={noop} />);
    // aria-label="新しいメンバー名" のテキストボックス
    const input = screen.getByRole("textbox", { name: /新しいメンバー名|member|name/i });
    // 既存メンバー "Alice" と同じ名前を入力
    fireEvent.change(input, { target: { value: "Alice" } });
    const addBtn = screen.getByRole("button", { name: /追加/i });
    fireEvent.click(addBtn);
    // role="alert" のエラーメッセージが表示される
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  // ─── 設定のローカル保存/復元（M2: FR-053/054）────────────────────────────
  it("保存済み設定があると Setup の初期値に復元される（FR-054）", () => {
    savePreferences({
      displayName: "Carol",
      language: "Python",
      difficulty: "hard",
      members: ["Carol", "Dave", "Eve"],
      intervalMinutes: 10,
    });
    render(<Setup onCreateRoom={noop} />);
    // 保存したメンバーが表示される（既定の Alice/Bob ではない）
    expect(screen.getByText("Carol")).toBeTruthy();
    expect(screen.getByText("Dave")).toBeTruthy();
    expect(screen.queryByText("Bob")).toBeNull();
    // 言語の select が Python になっている
    const lang = screen.getByLabelText(/言語/) as HTMLSelectElement;
    expect(lang.value).toBe("Python");
  });

  it("ルーム作成時に現在の設定が savePreferences で保存される（FR-053）", () => {
    render(<Setup onCreateRoom={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /ルームを作成/ }));
    const saved = loadPreferences();
    expect(saved).not.toBeNull();
    expect(saved?.language).toBe("TypeScript");
    expect(saved?.members.length).toBeGreaterThanOrEqual(2);
  });
});
