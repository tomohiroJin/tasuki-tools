/**
 * Setup 画面の v3.0 追加オプション（§9.1 / §16）のテスト
 *
 * ナビゲーター役・強い交代通知・休憩リマインダを Setup で設定でき、
 * config に乗って onCreateRoom へ渡ることを検証する。
 * バックエンド（config.set の decide 検証）は実装済みだが、Setup に入口が無かった。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Setup } from "../../src/ui/Setup.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

describe("Setup v3.0 オプション（§9.1）", () => {
  beforeEach(() => clearPreferences());

  it("ナビゲーター・強い交代通知・休憩のトグルが表示される", () => {
    render(<Setup onCreateRoom={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /ナビゲーター/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /強い交代通知|目立つ.*通知/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /休憩/ })).toBeTruthy();
  });

  it("既定（トグル OFF）では config に各フラグが立たない", () => {
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    fireEvent.click(screen.getByRole("button", { name: /ルームを作成/ }));
    const config = onCreateRoom.mock.calls[0]?.[0];
    expect(config.navigatorEnabled).toBeFalsy();
    expect(config.assertiveSwitch).toBeFalsy();
    expect(config.breakEveryRotations).toBeFalsy();
  });

  it("トグルを ON にして作成すると config に反映される", () => {
    const onCreateRoom = vi.fn();
    render(<Setup onCreateRoom={onCreateRoom} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /ナビゲーター/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /強い交代通知|目立つ.*通知/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /休憩/ }));
    fireEvent.click(screen.getByRole("button", { name: /ルームを作成/ }));
    const config = onCreateRoom.mock.calls[0]?.[0];
    expect(config.navigatorEnabled).toBe(true);
    expect(config.assertiveSwitch).toBe(true);
    // 休憩リマインダ ON は「N巡ごと」の正の整数になる
    expect(typeof config.breakEveryRotations).toBe("number");
    expect(config.breakEveryRotations).toBeGreaterThanOrEqual(1);
  });

  it("交代間隔に推奨指針（5〜10分）が表示される（§10.2）", () => {
    render(<Setup onCreateRoom={vi.fn()} />);
    expect(screen.getByText(/5\s*〜\s*10\s*分|推奨/)).toBeTruthy();
  });
});
