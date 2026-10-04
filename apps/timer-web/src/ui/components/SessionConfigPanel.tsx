/**
 * ロビーのセッション設定パネル（交代間隔＋詳細設定）。ConfigPanel から分割（v2.9）。
 * 変更は onChange(patch) で通知し、呼び出し側が config.set を送る。
 * かつては canEdit=false（見学者）向けの読み取り表示を持っていた（#95 S3 で廃止）。
 */
import React from "react";
import { Settings2, ChevronDown } from "lucide-react";
import { VALID_INTERVAL_MINUTES, type IntervalMinutes } from "@tasuki/timer-core/aggregate";
import type { SessionConfig } from "@tasuki/timer-core";
import { SectionHeader } from "../primitives.js";

interface SessionConfigPanelProps {
  config: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
}

export function SessionConfigPanel({ config, onChange }: SessionConfigPanelProps) {
  const navigatorEnabled = config.navigatorEnabled === true;
  const assertiveSwitch = config.assertiveSwitch === true;

  return (
    // 先頭の SectionHeader は自分の margin-bottom（1rem）を持つので、子の間の 1.25rem は交代間隔のブロックにだけ効く。
    <div className="session-config-panel">
      <SectionHeader icon={Settings2} title="セッション設定" />
      <div>
        <p className="instrument-label session-config-label">交代間隔</p>
        <div className="session-config-intervals" role="group" aria-label="交代間隔">
          {VALID_INTERVAL_MINUTES.map((min: IntervalMinutes) => {
            const selected = config.intervalMinutes === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ intervalMinutes: min })}
                className={
                  selected
                    ? "tabular session-config-interval session-config-interval-selected"
                    : "tabular session-config-interval session-config-interval-idle"
                }
              >
                {min}分
              </button>
            );
          })}
        </div>
        <p className="session-config-hint">推奨は 5〜10 分。短いほど集中と学習が高まります。</p>
      </div>

      {/* 詳細設定（オプション2点・既定 OFF）。最初は折りたたみ。 */}
      <details className="session-config-details">
        <summary className="session-config-summary">
          <Settings2 className="session-config-summary-icon" aria-hidden="true" />
          詳細設定
          <ChevronDown className="session-config-summary-chevron" aria-hidden="true" />
        </summary>
        <div className="session-config-toggles">
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
    <label className="session-config-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="session-config-toggle-input"
      />
      <span>
        <span className="session-config-toggle-label">{label}</span>
        <span className="session-config-toggle-hint">{hint}</span>
      </span>
    </label>
  );
}
