/**
 * アクセシビリティ検証テスト
 * T069: 非機能(A11y), FR-032, SC-010 (US6/7/8)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { StatusStrip } from "../../src/ui/components/StatusStrip.js";
import { EndSessionZone } from "../../src/ui/components/EndSessionZone.js";
import { AiSettingsModal } from "../../src/ui/components/AiSettingsModal.js";

const noop = vi.fn();

describe("アクセシビリティ（T069）", () => {
  // ─── StatusStrip ───────────────────────────────────────────────────────────
  describe("StatusStrip", () => {
    it("role='status' を持つ（支援技術への状態通知）", () => {
      render(
        <StatusStrip
          phase="session"
          displayName="Alice"
          role="host"
          connectionStatus="online"
          roomCode="AA0001"
        />,
      );
      expect(screen.getByRole("status")).toBeTruthy();
    });

    it("接続状態がテキストで（色だけでなく）表現される（FR-032）", () => {
      render(
        <StatusStrip
          phase="session"
          displayName="Alice"
          role="host"
          connectionStatus="reconnecting"
          roomCode="AA0001"
        />,
      );
      expect(screen.getByText(/再接続|reconnect/i)).toBeTruthy();
    });
  });

  // ─── EndSessionZone ────────────────────────────────────────────────────────
  describe("EndSessionZone", () => {
    it("中断確認ダイアログは role='dialog' を持つ", () => {
      render(
        <EndSessionZone
          onComplete={noop}
          onAbort={noop}
          onReset={noop}
          isShared={false}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /中断|途中/i }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
    });

    it("ダイアログは aria-modal='true' を持つ", () => {
      render(
        <EndSessionZone
          onComplete={noop}
          onAbort={noop}
          onReset={noop}
          isShared={false}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /中断|途中/i }));
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
    });
  });

  // ─── AiSettingsModal ───────────────────────────────────────────────────────
  describe("AiSettingsModal", () => {
    it("モーダルは role='dialog' と aria-modal='true' を持つ", () => {
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
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
    });
  });
});
