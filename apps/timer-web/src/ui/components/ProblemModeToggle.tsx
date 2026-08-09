/**
 * お題あり/なしの明示セグメント切替（ルームタブ・host 用）。
 * ルーム単位の problemEnabled を、開始判断と同じ画面で明示的に選べるようにする。
 * 純粋表示＋コールバックのみ（WS/localStorage は親が担う）。
 */

import React from "react";
import { Code } from "lucide-react";

interface ProblemModeToggleProps {
  /** お題を使うか（room.config.problemEnabled !== false）。 */
  enabled: boolean;
  /** 選択変更。 */
  onChange: (enabled: boolean) => void;
}

export function ProblemModeToggle({ enabled, onChange }: ProblemModeToggleProps) {
  const segClass = (active: boolean) =>
    `flex-1 px-3 py-2 text-sm text-center transition-colors ${
      active
        ? "bg-[var(--signal)] text-[var(--on-signal)] font-semibold"
        : "bg-[var(--panel-2)] text-[var(--bone-muted)] hover:bg-[var(--panel-hover)]"
    }`;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--bone)]">
        <Code className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
        お題
      </div>
      <div
        role="radiogroup"
        aria-label="お題の使用"
        className="flex overflow-hidden rounded-md border border-[var(--hairline-strong)]"
      >
        <button
          type="button"
          role="radio"
          aria-label="お題あり"
          aria-checked={enabled}
          onClick={() => onChange(true)}
          className={segClass(enabled)}
        >
          お題あり
        </button>
        <button
          type="button"
          role="radio"
          aria-label="お題なし"
          aria-checked={!enabled}
          onClick={() => onChange(false)}
          className={segClass(!enabled)}
        >
          お題なし
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--bone-subtle)]">
        {enabled ? "課題（お題）を出題して取り組みます。" : "お題なしで自由に開始します。"}
      </p>
    </div>
  );
}
