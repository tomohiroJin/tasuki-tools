/**
 * EndSessionZone コンポーネントのテスト
 * @requirements FR-018, FR-019, FR-044, SC-005, US5, US8-3
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { EndSessionZone } from "../../src/ui/components/EndSessionZone.js";

describe("EndSessionZone", () => {
  const noop = vi.fn();

  it("完成・中断・リセットの3操作が表示される", () => {
    // When
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // Then
    expect(screen.getByRole("button", { name: /完成/i })).toBeTruthy(); // 完成ボタン
    expect(screen.getByRole("button", { name: /中断|途中/i })).toBeTruthy(); // 中断ボタン
    expect(screen.getByRole("button", { name: /最初から|リセット|再スタート/i })).toBeTruthy(); // リセット（最初から再スタート）ボタン
  });

  /**
   * @requirements Issue #22, FR-074b
   */
  it("完成を押して確認すると完成が記録される", () => {
    // 開始後は主催者以外も実行でき、誤操作の影響が全員に及ぶため、
    // 直呼びではなく確認を経て発火する。
    // Given
    const onComplete = vi.fn();
    render(
      <EndSessionZone
        onComplete={onComplete}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /完成/i }));
    fireEvent.click(screen.getByText("完成として記録する"));
    // Then
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("中断ボタン押下で確認ダイアログが開く", () => {
    // Given
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /中断|途中/i }));
    // Then（確認ダイアログが表示される）
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("『最初から』ボタン押下で確認ダイアログが開く", () => {
    // Given
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // When
    fireEvent.click(screen.getByRole("button", { name: /最初から|リセット|再スタート/i }));
    // Then
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("共有ルームでは他参加者への影響説明が表示される", () => {
    // Given
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={true}
      />,
    );
    // When（中断確認を開く）
    fireEvent.click(screen.getByRole("button", { name: /中断|途中/i }));
    // Then（他参加者への影響説明が含まれる）
    expect(screen.getByText(/全員|他の参加者|参加者/i)).toBeTruthy();
  });

  it("完成ボタンは全角の大げさな感嘆符『！』を使わない（参考デザインは半角 ! の祝祭表現を許容）", () => {
    // Given
    render(
      <EndSessionZone
        onComplete={noop}
        onAbort={noop}
        onReset={noop}
        isShared={false}
      />,
    );
    // Then（参考デザイン準拠で「完成!」（半角・達成感の演出）。全角の大げさな「！」は使わない）
    const btn = screen.getByRole("button", { name: /完成/i });
    expect(btn.textContent).toContain("完成");
    expect(btn.textContent).not.toContain("！");
  });
});
