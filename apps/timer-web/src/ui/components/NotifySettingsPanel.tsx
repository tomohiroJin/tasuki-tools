/**
 * 通知設定の純粋表示パネル（ポップオーバーとロビーカードで共用）。
 * 状態は持たず prefs を受け取り onChange/onPreview を呼ぶだけ。
 */
import React, { useId } from "react";
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
  // ポップオーバーとロビーカードで同時に描画されても id が衝突しないよう一意化する。
  const fieldId = useId();
  const soundFieldId = `${fieldId}-sound`;
  const volumeFieldId = `${fieldId}-volume`;
  const countdownSecondsFieldId = `${fieldId}-countdown-seconds`;
  const countdownModeToneId = `${fieldId}-countdown-mode-tone`;
  const countdownModeVoiceId = `${fieldId}-countdown-mode-voice`;
  const countdownVoiceFieldId = `${fieldId}-countdown-voice`;

  return (
    <div className="notify-settings">
      {/* 現在状態（ON/OFF と選択中の音名）を見出しに表示する。 */}
      <p className="notify-settings-heading">
        通知:{" "}
        <span className={prefs.enabled ? "notify-settings-state-on" : "notify-settings-state-off"}>
          {prefs.enabled ? "ON" : "OFF"}
        </span>
        <span className="notify-settings-state-off"> / 音: {currentLabel}</span>
      </p>

      {/* ON/OFF トグル（role="switch" + aria-checked で a11y 準拠） */}
      <label className="notify-settings-row">
        <span>交代を音で知らせる</span>
        <button
          type="button"
          role="switch"
          aria-label="交代を音で知らせる"
          aria-checked={prefs.enabled}
          onClick={() => onChange({ enabled: !prefs.enabled })}
          className={prefs.enabled ? "notify-settings-switch-on" : "notify-settings-switch-off"}
        >
          <span
            className={prefs.enabled ? "notify-settings-knob-on" : "notify-settings-knob-off"}
          />
        </button>
      </label>

      {/* 通知音セレクト＋試聴ボタン */}
      <div className="notify-settings-block">
        <label htmlFor={soundFieldId} className="instrument-label">
          通知音
        </label>
        <div className="notify-settings-field-row">
          <select
            id={soundFieldId}
            aria-label="通知音"
            value={prefs.soundId}
            onChange={(e) => onChange({ soundId: e.target.value })}
            className="ui-select notify-settings-select-grow"
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
            className="notify-settings-preview"
          >
            <Volume2 className="notify-settings-icon" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 音量スライダー */}
      <div className="notify-settings-block">
        <label htmlFor={volumeFieldId} className="instrument-label">
          音量
        </label>
        <input
          id={volumeFieldId}
          type="range"
          aria-label="音量"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="notify-settings-range"
        />
      </div>

      {/* カウントダウン予告音トグル（Issue #2） */}
      <label className="notify-settings-row notify-settings-block">
        <span>交代前にカウントダウン音を鳴らす</span>
        <button
          type="button"
          role="switch"
          aria-label="交代前にカウントダウン音を鳴らす"
          aria-checked={prefs.countdownEnabled}
          onClick={() => onChange({ countdownEnabled: !prefs.countdownEnabled })}
          className={prefs.countdownEnabled ? "notify-settings-switch-on" : "notify-settings-switch-off"}
        >
          <span
            className={prefs.countdownEnabled ? "notify-settings-knob-on" : "notify-settings-knob-off"}
          />
        </button>
      </label>

      {/* カウントダウン予告秒数スライダー（5〜15秒・Issue #2） */}
      <div className="notify-settings-block">
        <label htmlFor={countdownSecondsFieldId} className="instrument-label">
          カウントダウン予告秒数: {prefs.countdownSeconds}秒
        </label>
        <input
          id={countdownSecondsFieldId}
          type="range"
          aria-label="カウントダウン予告秒数"
          min={5}
          max={15}
          step={1}
          value={prefs.countdownSeconds}
          onChange={(e) => onChange({ countdownSeconds: Number(e.target.value) })}
          className="notify-settings-range"
        />
      </div>

      {/* カウントダウン方式（トーン音/音声読み上げ）・countdownEnabled 時のみ表示（Issue #5） */}
      {prefs.countdownEnabled && (
        <div className="notify-settings-block">
          <p className="instrument-label">カウントダウン方式</p>
          <div className="notify-settings-radio-group">
            <label htmlFor={countdownModeToneId} className="notify-settings-radio">
              <input
                type="radio"
                id={countdownModeToneId}
                name={`${fieldId}-countdown-mode`}
                aria-label="トーン音"
                checked={prefs.countdownMode === "tone"}
                onChange={() => onChange({ countdownMode: "tone" })}
              />
              トーン音
            </label>
            <label htmlFor={countdownModeVoiceId} className="notify-settings-radio">
              <input
                type="radio"
                id={countdownModeVoiceId}
                name={`${fieldId}-countdown-mode`}
                aria-label="音声読み上げ"
                checked={prefs.countdownMode === "voice"}
                onChange={() => onChange({ countdownMode: "voice" })}
              />
              音声読み上げ
            </label>
          </div>
          {prefs.countdownMode === "voice" && (
            <div className="notify-settings-voice">
              <label htmlFor={countdownVoiceFieldId} className="instrument-label">
                読み上げ話者
              </label>
              <select
                id={countdownVoiceFieldId}
                aria-label="読み上げ話者"
                value={prefs.countdownVoiceId}
                onChange={(e) => onChange({ countdownVoiceId: e.target.value as "voice-male" | "voice-female" })}
                className="ui-select notify-settings-voice-select"
              >
                <option value="voice-male">男声</option>
                <option value="voice-female">女声</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* OS 通知トグル */}
      <label className="notify-settings-row notify-settings-block">
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
