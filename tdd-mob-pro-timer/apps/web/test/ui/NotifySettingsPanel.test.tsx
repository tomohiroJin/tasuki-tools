import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { NotifySettingsPanel } from "../../src/ui/components/NotifySettingsPanel.js";

const prefs = { enabled: true, soundId: "department", osNotify: true, volume: 0.6 };

describe("NotifySettingsPanel", () => {
  it("現在状態（ON・選択音名）を見出しに表示する", () => {
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByText(/呼び出しチャイム/)).toBeTruthy();
  });
  it("音量スライダー変更で onChange({volume}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("slider", { name: "音量" }), { target: { value: "0.3" } });
    expect(onChange).toHaveBeenCalledWith({ volume: 0.3 });
  });
  it("試聴ボタンで onPreview を呼ぶ", () => {
    const onPreview = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole("button", { name: "試聴" }));
    expect(onPreview).toHaveBeenCalled();
  });
  it("音選択で onChange({soundId}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "通知音" }), { target: { value: "melody" } });
    expect(onChange).toHaveBeenCalledWith({ soundId: "melody" });
  });
});
