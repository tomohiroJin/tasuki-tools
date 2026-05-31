/**
 * EndSessionZone コンポーネントのテスト
 * T045/T046: FR-018,019,044, SC-005 (US5,US8-3)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { EndSessionZone } from "../../src/ui/components/EndSessionZone.js";

describe("EndSessionZone（T045/T046）", () => {
  const noop = vi.fn();

  it("完成・中断・リセットの3操作が表示される（FR-018）", () => {
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // 完成ボタン
    expect(screen.getByRole("button", { name: /完成/i })).toBeTruthy();
    // 中断ボタン
    expect(screen.getByRole("button", { name: /中断|途中/i })).toBeTruthy();
    // リセットボタン
    expect(screen.getByRole("button", { name: /リセット/i })).toBeTruthy();
  });

  it("完成を押すとコールバックが呼ばれる", () => {
    const onComplete = vi.fn();
    render(
      <EndSessionZone
        onComplete={onComplete}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /完成/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("中断ボタン押下で確認ダイアログが開く（FR-019）", () => {
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /中断|途中/i }));
    // 確認ダイアログが表示される
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("リセットボタン押下で確認ダイアログが開く（FR-019）", () => {
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /リセット/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("共有ルームでは他参加者への影響説明が表示される（FR-019）", () => {
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={true}
      />,
    );
    // 中断確認を開く
    fireEvent.click(screen.getByRole("button", { name: /中断|途中/i }));
    // 他参加者への影響説明が含まれる
    expect(screen.getByText(/全員|他の参加者|参加者/i)).toBeTruthy();
  });

  it("完成ボタンには感嘆符を付けない（語彙が実態と一致: FR-044）", () => {
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // 「完成！」ではなく「完成」
    const btn = screen.getByRole("button", { name: /完成/i });
    expect(btn.textContent).not.toContain("！");
    expect(btn.textContent).not.toContain("!");
  });
});
