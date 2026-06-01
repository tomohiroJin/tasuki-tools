/**
 * Setup 画面のオンボーディング導線テスト
 * T043/T044: FR-001,002,003 (US1)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Setup } from "../../src/ui/Setup.js";

describe("Setup オンボーディング（T043/T044）", () => {
  const noop = vi.fn();

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
});
