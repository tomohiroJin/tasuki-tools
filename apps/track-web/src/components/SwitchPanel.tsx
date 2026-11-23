/**
 * 切り替える（#476・FR-2・FR-4・FR-15・FR-16）。
 *
 * 作業名の欄と主のボタン（計測中は「切り替える」、止まっていれば大きな「開始」）、「いつから」の選択、候補の並び。
 * 候補は番号（数字キー 1〜9 と同じ）つきのボタンで、押すとその名前へ切り替える。星で定番に固定・解除する。
 * 「いつから」の選択は止める・休憩にするにも効くので、値は画面（`TrackRoom`）が持つ。
 * 作業名の長さの上限は、サーバーが文で返す（正規化した後の長さで数えるので、ここでは粗い上限だけを付ける）。
 */
import { useId, useState, type FormEvent } from 'react';
import { BACK_MINUTES, MAX_LABEL_INPUT, type BackMinutes, type Candidate } from '@tasuki/track-core';
import {
  BACK_FIELD,
  BACK_NOW,
  CANDIDATES_HINT,
  CANDIDATES_LABEL,
  LABEL_FIELD,
  LABEL_PLACEHOLDER,
  START_BUTTON,
  SWITCH_BUTTON,
  SWITCH_HEADING,
  TOPIC_MARK,
  backOption,
  pinLabel,
} from '../copy';

interface Props {
  running: boolean;
  candidates: readonly Candidate[];
  /** 「いつから」（null = いまから） */
  backMin: BackMinutes | null;
  onBackMinChange: (backMin: BackMinutes | null) => void;
  canOperate: boolean;
  /** 作業名で開始・切り替え（空は名前なし） */
  onStart: (label: string) => void;
  onPin: (label: string, pinned: boolean) => void;
}

export function SwitchPanel({ running, candidates, backMin, onBackMinChange, canOperate, onStart, onPin }: Props) {
  const headingId = useId();
  const labelId = useId();
  const backId = useId();
  const [label, setLabel] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canOperate) return;
    onStart(label);
    setLabel('');
  };

  return (
    <section className="track-switch ui-stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{SWITCH_HEADING}</h2>
      <form className="track-switch-form" onSubmit={submit}>
        <div className="track-field">
          <label htmlFor={labelId}>{LABEL_FIELD}</label>
          <input
            id={labelId}
            className="ui-input"
            type="text"
            value={label}
            maxLength={MAX_LABEL_INPUT}
            placeholder={LABEL_PLACEHOLDER}
            autoComplete="off"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="track-field">
          <label htmlFor={backId}>{BACK_FIELD}</label>
          <select
            id={backId}
            className="ui-select"
            value={backMin ?? 0}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              onBackMinChange(BACK_MINUTES.find((m) => m === minutes) ?? null);
            }}
          >
            <option value={0}>{BACK_NOW}</option>
            {BACK_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {backOption(minutes)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={running ? 'ui-button' : 'ui-button ui-button--lg'} disabled={!canOperate}>
          {running ? SWITCH_BUTTON : START_BUTTON}
        </button>
      </form>
      {candidates.length > 0 && (
        <div className="ui-stack ui-stack--tight">
          <ol className="track-candidates" aria-label={CANDIDATES_LABEL}>
            {candidates.map((candidate, index) => (
              <li key={candidate.label} className="track-candidate">
                <button type="button" className="track-candidate-pick" disabled={!canOperate} onClick={() => onStart(candidate.label)}>
                  <span className="track-candidate-number">{index + 1}</span>
                  {candidate.source === 'topic' && <span className="track-candidate-topic">{TOPIC_MARK}</span>}
                  <span className="track-candidate-label">{candidate.label}</span>
                </button>
                <button
                  type="button"
                  className="track-pin"
                  aria-pressed={candidate.pinned}
                  aria-label={pinLabel(candidate.label)}
                  disabled={!canOperate}
                  onClick={() => onPin(candidate.label, !candidate.pinned)}
                >
                  {/* 星は字にしない（書体に頼らない）。固定は塗り、解除は線で示す（色だけに頼らない） */}
                  <svg className="track-pin-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6-4.5-4.2 6.1-.8z" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          <p className="track-hint">{CANDIDATES_HINT}</p>
        </div>
      )}
    </section>
  );
}
