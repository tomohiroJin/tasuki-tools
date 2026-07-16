import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { NotifySettingsPanel } from "../../src/ui/components/NotifySettingsPanel.js";

const prefs = {
  enabled: true, soundId: "department", osNotify: true, volume: 0.6,
  countdownEnabled: true, countdownSeconds: 15,
  countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const,
};

describe("NotifySettingsPanel", () => {
  it("現在状態（ON・選択音名）を見出しに表示する", () => {
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    const heading = screen.getByText(/通知:/);
    expect(heading).toHaveTextContent("呼び出しチャイム");
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
  it("二重描画（ポップオーバー＋ロビーカード）でも id が衝突せず label が各 select に紐付く（useId）", () => {
    const { container } = render(
      <>
        <NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />
        <NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />
      </>,
    );
    const selectIds = Array.from(
      container.querySelectorAll<HTMLSelectElement>('select[aria-label="通知音"]'),
    ).map((s) => s.id);
    expect(selectIds).toHaveLength(2);
    // 2 つの id は空でなく互いに異なる（DOM id 重複なし）。
    expect(selectIds[0]).toBeTruthy();
    expect(selectIds[0]).not.toBe(selectIds[1]);
    // 各 select id に対応する <label htmlFor> が存在する（紐付け健全）。
    for (const id of selectIds) {
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it("カウントダウン予告トグルで onChange({countdownEnabled}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByRole("switch", { name: "交代前にカウントダウン音を鳴らす" }));
    // フィクスチャの countdownEnabled は true（Task 4 で新設した方式UIの可視性テストに合わせた既定値）なので、トグルで false に反転する。
    expect(onChange).toHaveBeenCalledWith({ countdownEnabled: false });
  });

  it("カウントダウン予告秒数スライダーで onChange({countdownSeconds}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("slider", { name: "カウントダウン予告秒数" }), { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith({ countdownSeconds: 10 });
  });

  it("カウントダウン予告秒数の現在値を見出しに表示する", () => {
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownSeconds: 8 }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByText(/8秒/)).toBeTruthy();
  });

  it("カウントダウン方式ラジオボタンが表示され、トーン音が既定で選択されている", () => {
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    const toneRadio = screen.getByRole("radio", { name: "トーン音" }) as HTMLInputElement;
    const voiceRadio = screen.getByRole("radio", { name: "音声読み上げ" }) as HTMLInputElement;
    expect(toneRadio.checked).toBe(true);
    expect(voiceRadio.checked).toBe(false);
  });

  it("「音声読み上げ」選択で onChange({countdownMode: 'voice'}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "音声読み上げ" }));
    expect(onChange).toHaveBeenCalledWith({ countdownMode: "voice" });
  });

  it("countdownMode が voice のときのみ話者セレクトを表示する", () => {
    const { rerender } = render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "読み上げ話者" })).toBeNull();

    rerender(<NotifySettingsPanel prefs={{ ...prefs, countdownMode: "voice" }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "読み上げ話者" })).toBeTruthy();
  });

  it("話者セレクト変更で onChange({countdownVoiceId}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownMode: "voice" }} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "読み上げ話者" }), { target: { value: "voice-female" } });
    expect(onChange).toHaveBeenCalledWith({ countdownVoiceId: "voice-female" });
  });

  it("countdownEnabled が false のとき方式ラジオボタンを表示しない", () => {
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownEnabled: false }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "トーン音" })).toBeNull();
  });
});
