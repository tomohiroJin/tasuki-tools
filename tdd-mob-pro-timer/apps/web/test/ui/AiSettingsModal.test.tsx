/**
 * AiSettingsModal コンポーネントのテスト
 * T054/T055: FR-014,015,016,042,043 (US4)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { AiSettingsModal } from "../../src/ui/components/AiSettingsModal.js";

describe("AiSettingsModal（T054/T055）", () => {
  const noop = vi.fn();

  it("モーダルが open のとき表示される", () => {
    render(
      <AiSettingsModal
        open={true}
        mode="fallback"
        hasKey={false}
        onClose={noop}
        onModeChange={noop}
        onKeySave={noop}
        onKeyClear={noop}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("open=false のとき非表示", () => {
    render(
      <AiSettingsModal
        open={false}
        mode="fallback"
        hasKey={false}
        onClose={noop}
        onModeChange={noop}
        onKeySave={noop}
        onKeyClear={noop}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AI モードと定型モードの切り替えができる（FR-043）", () => {
    const onModeChange = vi.fn();
    render(
      <AiSettingsModal
        open={true}
        mode="fallback"
        hasKey={false}
        onClose={noop}
        onModeChange={onModeChange}
        onKeySave={noop}
        onKeyClear={noop}
      />,
    );
    // value="ai" のラジオボタンを選択
    const radios = screen.getAllByRole("radio");
    const aiRadio = radios.find((r) => (r as HTMLInputElement).value === "ai");
    expect(aiRadio).toBeTruthy();
    fireEvent.click(aiRadio!);
    expect(onModeChange).toHaveBeenCalledWith("ai");
  });

  it("鍵が未設定のとき設定導線を表示する（FR-014）", () => {
    render(
      <AiSettingsModal
        open={true}
        mode="ai"
        hasKey={false}
        onClose={noop}
        onModeChange={noop}
        onKeySave={noop}
        onKeyClear={noop}
      />,
    );
    // API キー入力フォームが表示される（type=password は labelで検索）
    expect(screen.getByLabelText(/Anthropic API キー|API.*Key/i)).toBeTruthy();
  });

  it("鍵を保存するとコールバックが呼ばれる（FR-017）", () => {
    const onKeySave = vi.fn();
    render(
      <AiSettingsModal
        open={true}
        mode="ai"
        hasKey={false}
        onClose={noop}
        onModeChange={noop}
        onKeySave={onKeySave}
        onKeyClear={noop}
      />,
    );
    const input = screen.getByLabelText(/Anthropic API キー|API.*Key/i);
    fireEvent.change(input, { target: { value: "sk-ant-test" } });
    const saveBtn = screen.getByRole("button", { name: /保存|save/i });
    fireEvent.click(saveBtn);
    expect(onKeySave).toHaveBeenCalledWith("sk-ant-test", expect.any(Boolean));
  });

  it("現在の出題モードが表示される（FR-042）", () => {
    render(
      <AiSettingsModal
        open={true}
        mode="ai"
        hasKey={true}
        onClose={noop}
        onModeChange={noop}
        onKeySave={noop}
        onKeyClear={noop}
      />,
    );
    // value="ai" のラジオが checked になっている
    const radios = screen.getAllByRole("radio");
    const aiRadio = radios.find((r) => (r as HTMLInputElement).value === "ai");
    expect(aiRadio).toBeTruthy();
    expect((aiRadio as HTMLInputElement).checked).toBe(true);
  });
});
