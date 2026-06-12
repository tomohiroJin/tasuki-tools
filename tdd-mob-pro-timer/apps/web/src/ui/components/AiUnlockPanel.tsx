/**
 * ホスト用: AI お題生成の解錠パネル。
 * 合言葉（サーバ env の AI_UNLOCK_KEY）を知るホストだけが解錠できる。
 * 入力欄は常時表示する（クライアントはサーバの設定状態を知らない。未設定サーバでは失敗するだけ）。
 * 平文は保持・表示しない（snapshot の aiUnlocked だけで状態を表す）。
 */
import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { MAX_AI_UNLOCK_KEY } from "@tdd-mob/core/aggregate";
import { PrimaryButton, GhostButton, SectionHeader } from "../primitives.js";

interface AiUnlockPanelProps {
  /** 解錠済みか（snapshot の aiUnlocked） */
  unlocked: boolean;
  /** 現在 AI モードか（snapshot の problemMode === "ai"） */
  aiMode: boolean;
  /** 合言葉で解錠を試みる */
  onUnlock: (key: string) => void;
  /** AI ⇔ 定型の切替（problem.mode.set） */
  onModeSet: (mode: "ai" | "fallback") => void;
}

export function AiUnlockPanel({ unlocked, aiMode, onUnlock, onModeSet }: AiUnlockPanelProps) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value) return;
    onUnlock(value);
    setValue(""); // 確定後は平文を画面状態に残さない
  };
  return (
    <div className="w-full">
      <SectionHeader icon={Sparkles} color="text-[var(--signal)]" title="AI お題生成" />
      {unlocked ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-[var(--bone-muted)]">
            {aiMode ? "AI 生成: 有効（お題を AI が作成します）" : "AI 生成: 解錠済み（定型を使用中）"}
          </span>
          {aiMode ? (
            <GhostButton onClick={() => onModeSet("fallback")} aria-pressed={true} className="text-sm">
              定型に戻す
            </GhostButton>
          ) : (
            <GhostButton onClick={() => onModeSet("ai")} aria-pressed={false} className="text-sm">
              AI 生成を使う
            </GhostButton>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-label="AI 生成の合言葉"
            autoComplete="off"
            maxLength={MAX_AI_UNLOCK_KEY}
            placeholder="合言葉を知っている場合のみ"
            className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
          />
          <PrimaryButton onClick={submit} disabled={!value} className="px-4 py-2 min-h-[44px] sm:min-h-0 text-sm">
            解錠
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
