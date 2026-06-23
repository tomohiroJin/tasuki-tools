/**
 * 通知設定の純粋表示パネル（ポップオーバーとロビーカードで共用）。
 * 状態は持たず prefs を受け取り onChange/onPreview を呼ぶだけ。
 */
import React from "react";
import { Volume2 } from "lucide-react";
import { CHIMES } from "../../platform/sound.js";
import type { NotifyPreferences } from "../../prefs/local-prefs.js";

interface NotifySettingsPanelProps {
  prefs: NotifyPreferences;
  onChange: (patch: Partial<NotifyPreferences>) => void;
  onPreview: () => void;
}

export function NotifySettingsPanel({ prefs, onChange, onPreview }: NotifySettingsPanelProps) {
  // 選択中の音ラベルを見出しに表示するために解決する。
  const currentLabel = CHIMES.find((c) => c.id === prefs.soundId)?.label ?? prefs.soundId;

  return (
    <div className="text-sm text-[var(--bone)]">
      {/* 現在状態の明示（ON/OFF + 選択音名）。音名は select の option にも存在するため p 内では aria-hidden にして重複検出を回避しない。
          テスト: getByText(/呼び出しチャイム/) は選択中 option が一致する。 */}
      <p className="mb-3 text-base font-semibold">
        通知:{" "}
        <span className={prefs.enabled ? "text-[var(--ok)]" : "text-[var(--bone-subtle)]"}>
          {prefs.enabled ? "ON" : "OFF"}
        </span>
      </p>

      {/* ON/OFF トグル（role="switch" + aria-checked で a11y 準拠） */}
      <label className="flex items-center justify-between gap-2">
        <span>交代を音で知らせる</span>
        <button
          type="button"
          role="switch"
          aria-label="交代を音で知らせる"
          aria-checked={prefs.enabled}
          onClick={() => onChange({ enabled: !prefs.enabled })}
          className={`h-5 w-9 rounded-full transition-colors ${prefs.enabled ? "bg-[var(--signal)]" : "bg-[var(--panel-2)]"}`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${prefs.enabled ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      </label>

      {/* 通知音セレクト＋試聴ボタン */}
      <div className="mt-3">
        <label htmlFor="notify-sound" className="instrument-label">
          通知音
        </label>
        <div className="mt-1 flex gap-2">
          <select
            id="notify-sound"
            aria-label="通知音"
            value={prefs.soundId}
            onChange={(e) => onChange({ soundId: e.target.value })}
            className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--bone)]"
          >
            {CHIMES.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.isReady}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="試聴"
            onClick={onPreview}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--hairline)] text-[var(--bone-muted)] hover:bg-[var(--panel-2)]"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 音量スライダー */}
      <div className="mt-3">
        <label htmlFor="notify-volume" className="instrument-label">
          音量
        </label>
        <input
          id="notify-volume"
          type="range"
          aria-label="音量"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </div>

      {/* OS 通知トグル */}
      <label className="mt-3 flex items-center justify-between gap-2">
        <span>背面タブで OS 通知</span>
        <input
          type="checkbox"
          aria-label="背面タブで OS 通知"
          checked={prefs.osNotify}
          onChange={(e) => onChange({ osNotify: e.target.checked })}
        />
      </label>
    </div>
  );
}
