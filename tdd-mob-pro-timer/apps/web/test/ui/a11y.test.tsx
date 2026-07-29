/**
 * アクセシビリティ検証テスト
 * @requirements FR-032, SC-010, US6, US7, US8
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";
import { EndSessionZone } from "../../src/ui/components/EndSessionZone.js";
import { InvitePanel } from "../../src/ui/components/InvitePanel.js";

const noop = vi.fn();

describe("アクセシビリティ", () => {
  // ─── StatusStrip ───────────────────────────────────────────────────────────
  describe("StatusStrip", () => {
    it("role='status' を持つ（支援技術への状態通知）", () => {
      // When
      render(
        <StatusStrip
          phase="session"
          displayName="Alice"
          role="host"
          connectionStatus="online"
          roomCode="AA0001"
        />,
      );
      // Then
      expect(screen.getByRole("status")).toBeTruthy();
    });

    it("接続状態がテキストで（色だけでなく）表現される", () => {
      // When
      render(
        <StatusStrip
          phase="session"
          displayName="Alice"
          role="host"
          connectionStatus="reconnecting"
          roomCode="AA0001"
        />,
      );
      // Then
      expect(screen.getByText(/再接続|reconnect/i)).toBeTruthy();
    });
  });

  // ─── EndSessionZone ────────────────────────────────────────────────────────
  describe("EndSessionZone", () => {
    it("中断確認ダイアログは role='dialog' を持つ", () => {
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
      // Then
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
    });

    it("ダイアログは aria-modal='true' を持つ", () => {
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
      // Then
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
    });
  });

  // ─── アイコンボタンのアクセシブル名（R5-4・SR ラベル） ─────────────────────
  describe("アイコンボタンのアクセシブル名", () => {
    it("EndSessionZone の終了系ボタンはアイコン同梱でもテキストで名前を持つ", () => {
      // Given（アイコン（Flag/RotateCcw 等）は装飾扱い（aria-hidden）にし、
      // ボタンの可触名は併記したテキストから取れることを保証する）
      render(
        <EndSessionZone
          onComplete={noop}
          onAbort={noop}
          onReset={noop}
          isShared={false}
        />,
      );
      // Then
      expect(screen.getByRole("button", { name: /完成/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /最初から|リセット|再スタート/ })).toBeTruthy();
    });

    it("InvitePanel のコピー操作は aria-label でアクセシブル名を持つ", () => {
      // When
      render(<InvitePanel code="ABC123" />);
      // Then
      expect(
        screen.getByRole("button", { name: "ルームコードをコピー" }),
      ).toBeTruthy();
    });
  });
});
