/**
 * AI 設定モーダル
 * T055: FR-014,015,016,042,043 (US4)
 *
 * 鍵入力 / 出題モード切替 / 出所明示 / 生成中状態を提供する。
 * 鍵は key-storage.ts 経由で保存し、サーバー送信禁止（FR-017）。
 */

import React, { useState, useRef } from "react";
import type { ProblemMode } from "@tdd-mob/core";
import { Button } from "./Button.js";
import { useFocusTrap } from "../useFocusTrap.js";

interface AiSettingsModalProps {
  open: boolean;
  mode: ProblemMode;
  hasKey: boolean;
  onClose: () => void;
  onModeChange: (mode: ProblemMode) => void;
  onKeySave: (key: string, persistent: boolean) => void;
  onKeyClear: () => void;
}

export function AiSettingsModal({
  open,
  mode,
  hasKey,
  onClose,
  onModeChange,
  onKeySave,
  onKeyClear,
}: AiSettingsModalProps) {
  const [keyInput, setKeyInput] = useState("");
  const [persistent, setPersistent] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc クローズ・Tab トラップ・初期フォーカス（閉じるボタン）・フォーカス復帰を共用フックで担う。
  useFocusTrap({
    open,
    containerRef: dialogRef,
    onClose,
    initialFocusRef: closeRef,
  });

  if (!open) return null;

  const handleSave = () => {
    if (!keyInput.trim()) return;
    onKeySave(keyInput.trim(), persistent);
    setKeyInput("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "var(--color-overlay)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI 設定"
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-fg">AI 設定</h2>
          <Button ref={closeRef} intent="neutral" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* 出題モード */}
        <fieldset className="mb-4">
          <legend className="text-sm font-semibold text-fg mb-2">出題モード</legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="problem-mode"
                value="ai"
                checked={mode === "ai"}
                onChange={() => onModeChange("ai")}
                aria-label="AI 生成"
              />
              <span className="text-sm text-fg">AI 生成</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="problem-mode"
                value="fallback"
                checked={mode === "fallback"}
                onChange={() => onModeChange("fallback")}
                aria-label="定型（AI を使わない）"
              />
              <span className="text-sm text-fg">定型（AI を使わない）</span>
            </label>
          </div>
        </fieldset>

        {/* API キー設定 */}
        <div className="mb-4">
          <label htmlFor="ai-api-key" className="block text-sm font-semibold text-fg mb-1">
            Anthropic API キー
          </label>
          {/* 信頼感のための明示（FR-017）。鍵は本人端末内のみで使い、同期サーバーへは送らない。 */}
          <p className="text-xs text-fg-subtle mb-2">
            鍵はこの端末内でのみ使われ、サーバーには送信されません。
          </p>
          {hasKey ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-fg-muted flex-1">●●●●●●●●（設定済み）</span>
              <Button intent="danger" size="sm" onClick={onKeyClear}>
                削除
              </Button>
            </div>
          ) : (
            <>
              <input
                id="ai-api-key"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                aria-label="Anthropic API キー"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mb-2"
              />
              <label className="flex items-center gap-2 text-xs text-fg-muted mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={persistent}
                  onChange={(e) => setPersistent(e.target.checked)}
                />
                この端末に保存（XSS 等で漏えいするリスクがあります）
              </label>
              <Button intent="primary" size="sm" onClick={handleSave} className="w-full">
                保存
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
