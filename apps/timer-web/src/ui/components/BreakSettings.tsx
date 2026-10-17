/**
 * ロビーの休憩の条件（#402）。詳細設定の `<details>` の中に置く。
 * 条件（なし／経過時間／周回）→ 間隔 → 入り方の 3 段。間隔と入り方は条件が「なし」のときは出さない。
 * 変更は onChange(policy) で通知し、呼び出し側が config.set を送る（セッション中はサーバーが拒む）。
 */
import React from "react";
import {
  BREAK_ELAPSED_MINUTES,
  BREAK_MODES,
  BREAK_ROUNDS,
  BREAK_TRIGGERS,
  DEFAULT_BREAK_EVERY,
  type BreakMode,
  type BreakPolicy,
  type BreakTrigger,
} from "@tasuki/timer-core";
import { BREAK_TEXT, roundsEstimateText } from "../break-view.js";

interface BreakSettingsProps {
  policy: BreakPolicy | undefined;
  intervalMinutes: number;
  /** 適格な席の数（周回の目安に使う） */
  eligibleSeats: number;
  onChange: (policy: BreakPolicy) => void;
}

const TRIGGER_LABEL: Record<BreakTrigger, string> = {
  none: BREAK_TEXT.triggerNone,
  elapsed: BREAK_TEXT.triggerElapsed,
  rounds: BREAK_TEXT.triggerRounds,
};

const MODE_LABEL: Record<BreakMode, string> = {
  auto: BREAK_TEXT.modeAuto,
  suggest: BREAK_TEXT.modeSuggest,
};

export function BreakSettings({ policy, intervalMinutes, eligibleSeats, onChange }: BreakSettingsProps) {
  const current: BreakPolicy = policy ?? { trigger: "none", every: 0, mode: "auto" };

  const chooseTrigger = (trigger: BreakTrigger) => {
    if (trigger === "none") onChange({ trigger, every: 0, mode: current.mode });
    else onChange({ trigger, every: DEFAULT_BREAK_EVERY[trigger], mode: current.mode });
  };

  const everyOptions: readonly number[] =
    current.trigger === "elapsed" ? BREAK_ELAPSED_MINUTES : current.trigger === "rounds" ? BREAK_ROUNDS : [];

  return (
    <div className="break-settings">
      <p className="instrument-label session-config-label">{BREAK_TEXT.settingsLabel}</p>
      <div className="session-config-intervals" role="group" aria-label={BREAK_TEXT.settingsLabel}>
        {BREAK_TRIGGERS.map((trigger) => (
          <button
            key={trigger}
            type="button"
            aria-pressed={current.trigger === trigger}
            onClick={() => chooseTrigger(trigger)}
            className={
                  current.trigger === trigger
                    ? "tabular session-config-interval session-config-interval-selected"
                    : "tabular session-config-interval session-config-interval-idle"
                }
          >
            {TRIGGER_LABEL[trigger]}
          </button>
        ))}
      </div>

      {current.trigger !== "none" && (
        <>
          <p className="instrument-label session-config-label break-settings-sublabel">{BREAK_TEXT.everyLabel}</p>
          <div className="session-config-intervals" role="group" aria-label={BREAK_TEXT.everyLabel}>
            {everyOptions.map((every) => (
              <button
                key={every}
                type="button"
                aria-pressed={current.every === every}
                onClick={() => onChange({ ...current, every })}
                className={
                  current.every === every
                    ? "tabular session-config-interval session-config-interval-selected"
                    : "tabular session-config-interval session-config-interval-idle"
                }
              >
                {current.trigger === "elapsed" ? BREAK_TEXT.minutes(every) : BREAK_TEXT.rounds(every)}
              </button>
            ))}
          </div>
          {current.trigger === "rounds" && (
            <p className="session-config-hint">
              {roundsEstimateText(intervalMinutes, eligibleSeats, current.every)}
            </p>
          )}

          <p className="instrument-label session-config-label break-settings-sublabel">{BREAK_TEXT.modeLabel}</p>
          <div className="session-config-intervals" role="group" aria-label={BREAK_TEXT.modeLabel}>
            {BREAK_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={current.mode === mode}
                onClick={() => onChange({ ...current, mode })}
                className={
                  current.mode === mode
                    ? "tabular session-config-interval session-config-interval-selected"
                    : "tabular session-config-interval session-config-interval-idle"
                }
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
