/**
 * 抜けを足す（#476・FR-18）。作業名・種類と、時間の指定（「始まりと終わり」か「始まりと長さ」）。
 *
 * 時刻の入力は日付を持たないので、「いま」より前の直近の時刻として読む（`time-input.ts`。純粋関数）。
 * 足した範囲に区切りがあれば、足した区切りで上書きされる（サーバーの規則。欄の下に 1 行で断る）。
 * 範囲の誤り（時刻が無い・順が逆・いまより先）は送る前にここで示し、それ以外の拒否はサーバーの文が画面の上に出る。
 */
import { useId, useState, type FormEvent } from 'react';
import { MAX_LABEL_INPUT, type SegmentKind } from '@tasuki/track-core';
import {
  EDIT_KIND_FIELD,
  EDIT_NAME_FIELD,
  INSERT_CANCEL,
  INSERT_END_FIELD,
  INSERT_ERROR_FUTURE,
  INSERT_ERROR_LENGTH,
  INSERT_ERROR_ORDER,
  INSERT_ERROR_TIME,
  INSERT_HEADING,
  INSERT_LENGTH_FIELD,
  INSERT_MODE_END,
  INSERT_MODE_FIELD,
  INSERT_MODE_LENGTH,
  INSERT_NOTE,
  INSERT_START_FIELD,
  INSERT_SUBMIT,
  KIND_BREAK,
  KIND_WORK,
} from '../copy';
import { insertRangeOf, type InsertRangeError } from '../time-input';

const ERROR_TEXT: Record<InsertRangeError, string> = {
  time: INSERT_ERROR_TIME,
  length: INSERT_ERROR_LENGTH,
  order: INSERT_ERROR_ORDER,
  future: INSERT_ERROR_FUTURE,
};

interface Props {
  epochWallMs: number;
  getNow: () => number;
  tzOffsetMin: number;
  canOperate: boolean;
  onInsert: (startMs: number, endMs: number, label: string, kind: SegmentKind) => void;
  onClose: () => void;
}

export function InsertForm({ epochWallMs, getNow, tzOffsetMin, canOperate, onInsert, onClose }: Props) {
  const headingId = useId();
  const nameId = useId();
  const kindId = useId();
  const modeId = useId();
  const startId = useId();
  const endId = useId();
  const lengthId = useId();
  const errorId = useId();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SegmentKind>('work');
  const [mode, setMode] = useState<'end' | 'length'>('end');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lengthMin, setLengthMin] = useState('');
  const [error, setError] = useState<InsertRangeError | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canOperate) return;
    const range = insertRangeOf({ start, mode, end, lengthMin }, getNow(), epochWallMs, tzOffsetMin);
    if (!range.ok) {
      setError(range.error);
      return;
    }
    setError(null);
    onInsert(range.startMs, range.endMs, kind === 'break' ? '' : label, kind);
    onClose();
  };

  return (
    // 検証は自前で行う（noValidate）。ブラウザの吹き出しは文言を選べず、読み上げにも乗りにくい
    <form className="track-insert ui-panel ui-stack" aria-labelledby={headingId} noValidate onSubmit={submit}>
      <h3 id={headingId}>{INSERT_HEADING}</h3>
      <div className="track-editor-row">
        <div className="track-field">
          <label htmlFor={nameId}>{EDIT_NAME_FIELD}</label>
          <input
            id={nameId}
            className="ui-input"
            type="text"
            value={kind === 'break' ? '' : label}
            maxLength={MAX_LABEL_INPUT}
            disabled={kind === 'break'}
            autoComplete="off"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="track-field">
          <label htmlFor={kindId}>{EDIT_KIND_FIELD}</label>
          <select id={kindId} className="ui-select" value={kind} onChange={(event) => setKind(event.target.value === 'break' ? 'break' : 'work')}>
            <option value="work">{KIND_WORK}</option>
            <option value="break">{KIND_BREAK}</option>
          </select>
        </div>
      </div>
      <div className="track-editor-row">
        <div className="track-field">
          <label htmlFor={modeId}>{INSERT_MODE_FIELD}</label>
          <select id={modeId} className="ui-select" value={mode} onChange={(event) => setMode(event.target.value === 'length' ? 'length' : 'end')}>
            <option value="end">{INSERT_MODE_END}</option>
            <option value="length">{INSERT_MODE_LENGTH}</option>
          </select>
        </div>
        <div className="track-field">
          <label htmlFor={startId}>{INSERT_START_FIELD}</label>
          <input id={startId} className="ui-input" type="time" value={start} aria-describedby={error ? errorId : undefined} onChange={(event) => setStart(event.target.value)} />
        </div>
        {mode === 'end' ? (
          <div className="track-field">
            <label htmlFor={endId}>{INSERT_END_FIELD}</label>
            <input id={endId} className="ui-input" type="time" value={end} aria-describedby={error ? errorId : undefined} onChange={(event) => setEnd(event.target.value)} />
          </div>
        ) : (
          <div className="track-field">
            <label htmlFor={lengthId}>{INSERT_LENGTH_FIELD}</label>
            <input
              id={lengthId}
              className="ui-input"
              type="text"
              inputMode="numeric"
              value={lengthMin}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setLengthMin(event.target.value)}
            />
          </div>
        )}
      </div>
      <p className="track-hint">{INSERT_NOTE}</p>
      {error !== null && (
        <p id={errorId} className="track-form-error ui-note ui-note--error" role="alert">
          {ERROR_TEXT[error]}
        </p>
      )}
      <div className="track-insert-actions">
        <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={onClose}>
          {INSERT_CANCEL}
        </button>
        <button type="submit" className="ui-button ui-button--sm" disabled={!canOperate}>
          {INSERT_SUBMIT}
        </button>
      </div>
    </form>
  );
}
