import { MAX_STEP_NAME, type TimeoutBehavior } from '@tasuki/agenda-core';
import {
  MINUTES_UNIT,
  MOVE_DOWN_BUTTON,
  MOVE_UP_BUTTON,
  ON_TIMEOUT_ADVANCE,
  ON_TIMEOUT_WAIT,
  REMOVE_BUTTON,
  stepMinusLabel,
  stepMinutesLabel,
  stepMoveDownLabel,
  stepMoveUpLabel,
  stepNameLabel,
  stepPlusLabel,
  stepRemoveLabel,
  stepTimeoutLabel,
} from '../copy';
import { MAX_MINUTES, MIN_MINUTES, bumpMinutes, clipStepName, minutesOf, type DraftStep } from '../scenario-draft';

interface Props {
  step: DraftStep;
  /** 1 から（盤の目盛りの番号と同じ） */
  number: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Omit<DraftStep, 'key'>>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

const TIMEOUTS: readonly { readonly value: TimeoutBehavior; readonly text: string }[] = [
  { value: 'wait', text: ON_TIMEOUT_WAIT },
  { value: 'advance', text: ON_TIMEOUT_ADVANCE },
];

/**
 * 組む画面の 1 行。[番号][名前] / [−][分][+] 分 [押すまで待つ|自動で次へ] / [上へ][下へ][消す]。
 * 狭い幅では塊ごと次の段へ回る（名前を先に読ませる）。読み上げの名前は行の番号で区別する。
 */
export function StepEditorRow({ step, number, isFirst, isLast, onChange, onMove, onRemove }: Props) {
  const minutes = minutesOf(step);
  return (
    <li className="builder-row">
      <span className="builder-row-number" aria-hidden="true">
        {number}
      </span>
      <input
        className="ui-input builder-row-name"
        aria-label={stepNameLabel(number)}
        autoComplete="off"
        maxLength={MAX_STEP_NAME}
        value={step.name}
        onChange={(event) => onChange({ name: clipStepName(event.target.value) })}
      />
      <div className="builder-row-controls">
        <div className="builder-minutes">
          <button
            type="button"
            className="ui-button ui-button--secondary builder-bump"
            aria-label={stepMinusLabel(number)}
            disabled={minutes !== null && minutes <= MIN_MINUTES}
            onClick={() => onChange({ minutes: bumpMinutes(step, -1) })}
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            className="ui-input builder-minutes-input"
            aria-label={stepMinutesLabel(number)}
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={1}
            value={step.minutes}
            onChange={(event) => onChange({ minutes: event.target.value })}
          />
          <button
            type="button"
            className="ui-button ui-button--secondary builder-bump"
            aria-label={stepPlusLabel(number)}
            disabled={minutes !== null && minutes >= MAX_MINUTES}
            onClick={() => onChange({ minutes: bumpMinutes(step, 1) })}
          >
            +
          </button>
          <span className="builder-minutes-unit" aria-hidden="true">
            {MINUTES_UNIT}
          </span>
        </div>
        <div className="builder-timeout" role="group" aria-label={stepTimeoutLabel(number)}>
          {TIMEOUTS.map((t) => (
            <button
              key={t.value}
              type="button"
              className="builder-timeout-option"
              aria-pressed={step.onTimeout === t.value}
              onClick={() => onChange({ onTimeout: t.value })}
            >
              {t.text}
            </button>
          ))}
        </div>
        <div className="builder-row-tools">
          <button
            type="button"
            className="ui-button ui-button--quiet ui-button--sm"
            aria-label={stepMoveUpLabel(number)}
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            {MOVE_UP_BUTTON}
          </button>
          <button
            type="button"
            className="ui-button ui-button--quiet ui-button--sm"
            aria-label={stepMoveDownLabel(number)}
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            {MOVE_DOWN_BUTTON}
          </button>
          <button type="button" className="ui-button ui-button--danger ui-button--sm" aria-label={stepRemoveLabel(number)} onClick={onRemove}>
            {REMOVE_BUTTON}
          </button>
        </div>
      </div>
    </li>
  );
}
