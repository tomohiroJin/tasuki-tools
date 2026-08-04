/**
 * ホスト用: ルームのパスフレーズ設定/解除パネル（R4-2・v2.2 Phase 3b）。
 * 未保護＝入力＋設定ボタン／保護中＝「設定中」表示＋解除ボタン。
 * 平文は保持・表示しない（snapshot の passphraseProtected だけで状態を表す）。
 */
import React, { useState } from "react";
import { Lock } from "lucide-react";
import { MAX_PASSPHRASE } from "@tasuki/timer-core/aggregate";
import { PrimaryButton, GhostButton, SectionHeader } from "../primitives.js";

interface PassphrasePanelProps {
  /** 現在パスフレーズ保護中か（snapshot の passphraseProtected）。 */
  protectedNow: boolean;
  /** 設定/解除。空文字で解除。 */
  onSet: (passphrase: string) => void;
}

export function PassphrasePanel({ protectedNow, onSet }: PassphrasePanelProps) {
  const [value, setValue] = useState("");
  // 設定確定（空は無視）。確定後は平文を画面状態に残さない。
  const submit = () => {
    if (!value) return;
    onSet(value);
    setValue("");
  };
  return (
    <div className="w-full">
      <SectionHeader icon={Lock} color="text-[var(--signal)]" title="パスフレーズ" />
      {protectedNow ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          {/* 状態は色ではなくテキストで明示（アイコンは SectionHeader の Lock に統一）。 */}
          <span className="text-[var(--bone-muted)]">パスフレーズ設定中</span>
          <GhostButton onClick={() => onSet("")} className="text-sm">
            解除
          </GhostButton>
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
            aria-label="パスフレーズ"
            maxLength={MAX_PASSPHRASE}
            placeholder="任意。設定すると参加に必要"
            className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
          />
          <PrimaryButton onClick={submit} disabled={!value} className="px-4 py-2 text-sm">
            設定
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
