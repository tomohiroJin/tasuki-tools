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
    // 既定メンバー（Alice/Bob）のうち 2 人目の名前入力を "Alice" に変えて重複させる
    const member2 = screen.getByLabelText("メンバー2の名前") as HTMLInputElement;
    fireEvent.change(member2, { target: { value: "Alice" } });
    // role="alert" の重複エラーが表示される
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
    // 保存したメンバーが名前入力欄に復元される（3人＝Carol/Dave/Eve）
    expect((screen.getByLabelText("メンバー1の名前") as HTMLInputElement).value).toBe("Carol");
    expect((screen.getByLabelText("メンバー2の名前") as HTMLInputElement).value).toBe("Dave");
    expect((screen.getByLabelText("メンバー3の名前") as HTMLInputElement).value).toBe("Eve");
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
