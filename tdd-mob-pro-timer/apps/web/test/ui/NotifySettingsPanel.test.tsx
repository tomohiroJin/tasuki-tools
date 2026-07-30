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
    // Given（prefs をそのまま使う）
    // When
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    // Then
    const heading = screen.getByText(/通知:/);
    expect(heading).toHaveTextContent("呼び出しチャイム");
  });
  it("音量スライダーを変更すると音量設定が更新される", () => {
    // Given
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    // When
    fireEvent.change(screen.getByRole("slider", { name: "音量" }), { target: { value: "0.3" } });
    // Then
    expect(onChange).toHaveBeenCalledWith({ volume: 0.3 });
  });
  it("試聴ボタンを押すと試聴が再生される", () => {
    // Given
    const onPreview = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={onPreview} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "試聴" }));
    // Then
    expect(onPreview).toHaveBeenCalled();
  });
  it("音を選択すると通知音の設定が更新される", () => {
    // Given
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    // When
    fireEvent.change(screen.getByRole("combobox", { name: "通知音" }), { target: { value: "melody" } });
    // Then
    expect(onChange).toHaveBeenCalledWith({ soundId: "melody" });
  });
  it("二重描画（ポップオーバー＋ロビーカード）でも id が衝突せず label が各 select に紐付く（useId）", () => {
    // Given（prefs をそのまま使い、同じパネルを2つ描画する）
    // When
    const { container } = render(
      <>
        <NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />
        <NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />
      </>,
    );
    // Then
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

  it("カウントダウン予告トグルを押すとカウントダウン予告設定が反転する", () => {
    // Given（フィクスチャの countdownEnabled は true（Task 4 で新設した方式UIの可視性
    // テストに合わせた既定値）なので、トグルで false に反転する）
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    // When
    fireEvent.click(screen.getByRole("switch", { name: "交代前にカウントダウン音を鳴らす" }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ countdownEnabled: false });
  });

  it("カウントダウン予告秒数スライダーを変更すると予告秒数の設定が更新される", () => {
    // Given
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    // When
    fireEvent.change(screen.getByRole("slider", { name: "カウントダウン予告秒数" }), { target: { value: "10" } });
    // Then
    expect(onChange).toHaveBeenCalledWith({ countdownSeconds: 10 });
  });

  it("カウントダウン予告秒数の現在値を見出しに表示する", () => {
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownSeconds: 8 }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByText(/8秒/)).toBeTruthy();
  });

  it("カウントダウン方式ラジオボタンが表示され、トーン音が既定で選択されている", () => {
    // Given（prefs をそのまま使う）
    // When
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    // Then
    const toneRadio = screen.getByRole("radio", { name: "トーン音" }) as HTMLInputElement;
    const voiceRadio = screen.getByRole("radio", { name: "音声読み上げ" }) as HTMLInputElement;
    expect(toneRadio.checked).toBe(true);
    expect(voiceRadio.checked).toBe(false);
  });

  it("「音声読み上げ」を選択するとカウントダウン方式が音声読み上げに変わる", () => {
    // Given
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    // When
    fireEvent.click(screen.getByRole("radio", { name: "音声読み上げ" }));
    // Then
    expect(onChange).toHaveBeenCalledWith({ countdownMode: "voice" });
  });

  it("countdownMode が voice のときのみ話者セレクトを表示する", () => {
    // Given
    const { rerender } = render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "読み上げ話者" })).toBeNull();
    // When
    rerender(<NotifySettingsPanel prefs={{ ...prefs, countdownMode: "voice" }} onChange={vi.fn()} onPreview={vi.fn()} />);
    // Then
    expect(screen.getByRole("combobox", { name: "読み上げ話者" })).toBeTruthy();
  });

  it("話者セレクトを変更すると読み上げ話者の設定が更新される", () => {
    // Given
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownMode: "voice" }} onChange={onChange} onPreview={vi.fn()} />);
    // When
    fireEvent.change(screen.getByRole("combobox", { name: "読み上げ話者" }), { target: { value: "voice-female" } });
    // Then
    expect(onChange).toHaveBeenCalledWith({ countdownVoiceId: "voice-female" });
  });

  it("countdownEnabled が false のとき方式ラジオボタンを表示しない", () => {
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownEnabled: false }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "トーン音" })).toBeNull();
  });
});
