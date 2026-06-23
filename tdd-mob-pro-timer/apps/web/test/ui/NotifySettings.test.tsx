import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { NotifySettings } from "../../src/ui/components/NotifySettings.js";

describe("NotifySettings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("歯車を押すとパネルが開き、既定は通知OFF", () => {
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    const toggle = screen.getByRole("switch", { name: "交代を音で知らせる" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("ONにすると localStorage に enabled=true が保存される", async () => {
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "交代を音で知らせる" }));
    });
    const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
    expect(saved.enabled).toBe(true);
  });

  it("音の選択を変えると soundId が保存される", () => {
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    fireEvent.change(screen.getByRole("combobox", { name: "通知音" }), { target: { value: "bell" } });
    const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
    expect(saved.soundId).toBe("bell");
  });

  it("パネル外をクリックするとパネルが閉じる", () => {
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    // パネルが開いていることを確認。
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // パネル外（document.body）をマウスダウンするとパネルが閉じる。
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("音量スライダーを動かすと volume が保存される", () => {
    render(<NotifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
    const slider = screen.getByRole("slider", { name: "音量" });
    fireEvent.change(slider, { target: { value: "0.3" } });
    const saved = JSON.parse(localStorage.getItem("tdd-mob:notify:v1") ?? "{}");
    expect(saved.volume).toBe(0.3);
  });
});
