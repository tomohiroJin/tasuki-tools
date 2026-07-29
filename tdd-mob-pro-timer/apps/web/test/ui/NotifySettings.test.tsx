import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { NotifySettings } from "../../src/ui/components/NotifySettings.js";
import { saveNotifyPreferences, DEFAULT_NOTIFY_PREFERENCES } from "../../src/prefs/local-prefs.js";

describe("NotifySettings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("歯車を押すとパネルが開き、既定は通知OFF", () => {
    // Given
    render(<NotifySettings />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    // Then
    const toggle = screen.getByRole("switch", { name: "交代を音で知らせる" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("ONにすると localStorage に enabled=true が保存される", async () => {
    // Given
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    // When
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "交代を音で知らせる" }));
    });
    // Then
    const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
    expect(saved.enabled).toBe(true);
  });

  it("音の選択を変えると soundId が保存される", () => {
    // Given
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    // When
    fireEvent.change(screen.getByRole("combobox", { name: "通知音" }), { target: { value: "bell" } });
    // Then
    const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
    expect(saved.soundId).toBe("bell");
  });

  it("パネル外をクリックするとパネルが閉じる", () => {
    // Given（パネルが開いていることを確認）
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // When（パネル外（document.body）をマウスダウンする）
    fireEvent.mouseDown(document.body);
    // Then
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("音量スライダーを動かすと volume が保存される", () => {
    // Given
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    // When
    const slider = screen.getByRole("slider", { name: "音量" });
    fireEvent.change(slider, { target: { value: "0.3" } });
    // Then
    const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
    expect(saved.volume).toBe(0.3);
  });

  /**
   * @requirements Issue #7
   */
  describe("他画面との同期", () => {
    it("マウント後に他画面（別コンポーネント）で設定が変更されたら、開いたときに最新の値を表示する", () => {
      // Given（他画面（例: ロビーの設定パネル）が保存した想定）
      render(<NotifySettings />);
      act(() => {
        saveNotifyPreferences({ ...DEFAULT_NOTIFY_PREFERENCES, soundId: "bell", enabled: true });
      });
      // When
      fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
      // Then
      const combobox = screen.getByRole("combobox", { name: "通知音" }) as HTMLSelectElement;
      expect(combobox.value).toBe("bell");
      const toggle = screen.getByRole("switch", { name: "交代を音で知らせる" });
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });

    it("他画面での変更後にポップオーバーで別フィールドを操作しても、その変更を巻き戻さない", () => {
      // Given
      render(<NotifySettings />);
      fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
      // ポップオーバーを開いた「後」に他画面が soundId を変更した想定。
      act(() => {
        saveNotifyPreferences({ ...DEFAULT_NOTIFY_PREFERENCES, soundId: "melody" });
      });
      // When（ポップオーバー内で無関係なフィールド（音量）を操作）
      fireEvent.change(screen.getByRole("slider", { name: "音量" }), { target: { value: "0.3" } });
      // Then
      const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
      expect(saved.soundId).toBe("melody");
      expect(saved.volume).toBe(0.3);
    });
  });
});
