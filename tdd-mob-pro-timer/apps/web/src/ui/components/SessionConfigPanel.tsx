/**
 * ロビーのセッション設定パネル（交代間隔＋詳細設定）。ConfigPanel から分割（v2.9）。
 * 変更は onChange(patch) で通知し、呼び出し側が config.set を送る。canEdit=false は読み取り表示。
 */
import React from "react";
import { Settings2, ChevronDown } from "lucide-react";
import { VALID_INTERVAL_MINUTES, type IntervalMinutes } from "@tdd-mob/core/aggregate";
import type { SessionConfig } from "@tdd-mob/core";
import { SectionHeader } from "../primitives.js";

interface SessionConfigPanelProps {
  config: SessionConfig;
  canEdit: boolean;
  onChange: (patch: Partial<SessionConfig>) => void;
}

export function SessionConfigPanel({ config, canEdit, onChange }: SessionConfigPanelProps) {
  if (!canEdit) {
    return (
      <div className="text-sm text-[var(--bone-muted)]">
        <SectionHeader icon={Settings2} color="text-[var(--signal)]" title="セッション設定" />
        <p>{config.intervalMinutes}分</p>
      </div>
    );
  }

  const navigatorEnabled = config.navigatorEnabled === true;
  const assertiveSwitch = config.assertiveSwitch === true;

  return (
    <div className="space-y-5">
      <SectionHeader icon={Settings2} color="text-[var(--signal)]" title="セッション設定" />
      <div>
        <p className="instrument-label mb-2">交代間隔</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="交代間隔">
          {VALID_INTERVAL_MINUTES.map((min: IntervalMinutes) => {
            const selected = config.intervalMinutes === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ intervalMinutes: min })}
                className={`px-4 py-2.5 rounded-md font-bold tabular transition-all border ${
                  selected
                    ? "bg-[var(--signal)] text-[#160603] border-[var(--signal)] shadow-[0_0_0_1px_rgba(255,74,46,0.5),0_4px_16px_var(--signal-glow)]"
                    : "bg-[var(--panel-2)] text-[var(--bone-muted)] border-[var(--hairline)] hover:bg-[#252934]"
                }`}
              >
                {min}分
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--bone-subtle)]">推奨は 5〜10 分。短いほど集中と学習が高まります。</p>
      </div>

      {/* 詳細設定（オプション2点・既定 OFF）。最初は折りたたみ。 */}
      <details className="rounded-md bg-[var(--panel-2)] border border-[var(--hairline)]">
        <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--bone)]">
          <Settings2 className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          詳細設定
          <ChevronDown className="w-4 h-4 ml-auto text-[var(--bone-subtle)]" aria-hidden="true" />
        </summary>
        <div className="space-y-3 px-4 pb-4">
          <Toggle
            checked={navigatorEnabled}
            onChange={(v) => onChange({ navigatorEnabled: v })}
            label="ナビゲーター役を明示する"
            hint="次の人をナビゲーター（指示役）として強調表示します。"
          />
          <Toggle
            checked={assertiveSwitch}
            onChange={(v) => onChange({ assertiveSwitch: v })}
            label="強い交代通知"
            hint="交代の瞬間に全画面で割り込み、見落としを防ぎます。"
          />
        </div>
      </details>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}

function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--signal)]"
      />
      <span>
        <span className="block text-sm font-medium text-[var(--bone)]">{label}</span>
        <span className="block text-xs text-[var(--bone-subtle)]">{hint}</span>
      </span>
    </label>
  );
}
