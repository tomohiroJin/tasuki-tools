/**
 * 区切りを直す（#476・FR-7・FR-17・設計 §4.3「手直しの制約」）。時系列の行の中に開く。
 *
 * - 名前と種類（作業／休憩）の付け替え
 * - 始まりと終わりを、時刻の入力か ±1 分・±5 分で動かす。動かせる範囲は track-core の `adjustRangeOf`（サーバーの判定と同じ規則）で求め、
 *   範囲に収める（使い切った所で止まる）。その向きへ動かせないボタンは押せない。計測中の区切りの終わりは出さない
 * - 途中で分ける（分ける時刻と後半の作業名）
 * - 消す（計測中は出さない）
 *
 * 止まっている間は画面を描き直さないので、押した瞬間の「いま」（`getNow`）で範囲を取り直してから送る。
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import { MAX_LABEL_INPUT, adjustRangeOf, type SegmentEdge, type SegmentKind, type SegmentView, type TrackView } from '@tasuki/track-core';
import {
  EDGE_END,
  EDGE_OUT_OF_RANGE,
  EDGE_SET_BUTTON,
  EDGE_START,
  EDIT_APPLY_BUTTON,
  EDIT_KIND_FIELD,
  EDIT_NAME_FIELD,
  KIND_BREAK,
  KIND_WORK,
  REMOVE_BUTTON,
  SPLIT_BUTTON,
  SPLIT_HEADING,
  SPLIT_NAME_FIELD,
  SPLIT_OUT_OF_RANGE,
  SPLIT_TIME_FIELD,
  edgeTimeLabel,
  stepLabel,
  stepText,
} from '../copy';
import type { TrackActions } from '../hooks/use-track-sync';
import { edgePositionOf, edgePreviewOf, splitPositionOf, type InsertPreview } from '../time-input';
import { clockOf, steppedEdge } from '../track-view';
import { ReadRangeHint } from './ReadRangeHint';

const MS_PER_MIN = 60_000;
/** 開いている間の描き直しの間隔。止まっている間は画面が描き直さないので、押せる・押せないを古いまま残さない */
const OPEN_TICK_MS = 1000;
/** ± のボタンの刻み（分）。並びは左から */
const STEPS = [-5, -1, 1, 5] as const;

interface Props {
  view: TrackView;
  segment: SegmentView;
  nowMs: number;
  getNow: () => number;
  tzOffsetMin: number;
  canOperate: boolean;
  actions: TrackActions;
  /** 区切りを消した後に呼ぶ（欄が外れるので、フォーカスの行き先を親が決める） */
  onRemoved: () => void;
}

export function SegmentEditor({ view, segment, nowMs, getNow, tzOffsetMin, canOperate, actions, onRemoved }: Props) {
  const nameId = useId();
  const kindId = useId();
  const splitTimeId = useId();
  const splitNameId = useId();
  const splitErrorId = useId();
  const [label, setLabel] = useState(segment.label);
  const [kind, setKind] = useState<SegmentKind>(segment.kind);
  const [splitTime, setSplitTime] = useState('');
  const [splitLabel, setSplitLabel] = useState('');
  const [splitError, setSplitError] = useState(false);
  const [edgeTime, setEdgeTime] = useState<Record<SegmentEdge, string>>({ start: '', end: '' });
  const [edgeError, setEdgeError] = useState<SegmentEdge | null>(null);
  const edgeErrorId = useId();
  // 開いている間は 1 秒ごとに描き直す（「いま」が上限の端は、時間が経つと動かせるようになる）
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), OPEN_TICK_MS);
    return () => clearInterval(id);
  }, []);
  const liveNow = Math.max(nowMs, getNow());

  const applyName = (event: FormEvent): void => {
    event.preventDefault();
    if (canOperate) actions.setSegment(segment.id, kind === 'break' ? '' : label, kind);
  };

  const positionOf = (edge: SegmentEdge): number | null => (edge === 'start' ? segment.startMs : segment.endMs);
  const targetOf = (edge: SegmentEdge, minutes: number, at: number): number | null => {
    const current = positionOf(edge);
    return current === null ? null : steppedEdge(current, minutes * MS_PER_MIN, adjustRangeOf(view.segments, segment.id, edge, at));
  };
  const step = (edge: SegmentEdge, minutes: number): void => {
    const target = targetOf(edge, minutes, getNow());
    if (target !== null) actions.adjustSegment(segment.id, edge, target);
  };
  const setEdge = (edge: SegmentEdge, event: FormEvent): void => {
    event.preventDefault();
    if (!canOperate) return;
    const current = positionOf(edge);
    if (current === null) return;
    const now = getNow();
    // 時刻は、動かす前の端に最も近い日の時刻として読む（日をまたぐ区切りも、前日の時刻で 23 時間の区切りにならない）
    const atMs = edgePositionOf(edgeTime[edge], adjustRangeOf(view.segments, segment.id, edge, now), current, now, view.epochWallMs, tzOffsetMin);
    setEdgeError(atMs === null ? edge : null);
    if (atMs === null) return;
    actions.adjustSegment(segment.id, edge, atMs);
    setEdgeTime((prev) => ({ ...prev, [edge]: '' }));
  };

  // 押す前に、読み取った時刻と動かした後の長さを出す。入力のたびに、「いま」を取り直して読む。読み取れない入力では出さない
  const previewOf = (edge: SegmentEdge): InsertPreview | null => {
    const current = positionOf(edge);
    if (current === null || edgeTime[edge] === '') return null;
    const now = getNow();
    const other = edge === 'start' ? (segment.endMs ?? now) : segment.startMs;
    return edgePreviewOf(edge, edgeTime[edge], adjustRangeOf(view.segments, segment.id, edge, now), current, other, now, view.epochWallMs, tzOffsetMin);
  };

  const split = (event: FormEvent): void => {
    event.preventDefault();
    if (!canOperate) return;
    const atMs = splitPositionOf(splitTime, segment, getNow(), view.epochWallMs, tzOffsetMin);
    setSplitError(atMs === null);
    if (atMs === null) return;
    actions.splitSegment(segment.id, atMs, splitLabel, 'work');
    setSplitTime('');
    setSplitLabel('');
  };

  const edges: readonly { edge: SegmentEdge; name: string }[] =
    segment.endMs === null ? [{ edge: 'start', name: EDGE_START }] : [{ edge: 'start', name: EDGE_START }, { edge: 'end', name: EDGE_END }];

  return (
    <div className="track-editor ui-stack">
      <form className="track-editor-row" onSubmit={applyName}>
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
        <button type="submit" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate}>
          {EDIT_APPLY_BUTTON}
        </button>
      </form>

      {edges.map(({ edge, name }) => (
        <div key={edge} className="track-edge" role="group" aria-label={name}>
          <span className="track-edge-name">{name}</span>
          <span className="track-edge-clock track-digits">{clockOf(view, positionOf(edge) ?? 0, tzOffsetMin)}</span>
          <span className="track-edge-steps">
            {STEPS.map((minutes) => {
              const text = stepText(minutes < 0 ? '−' : '+', Math.abs(minutes));
              return (
                <button
                  key={minutes}
                  type="button"
                  className="ui-button ui-button--secondary ui-button--sm"
                  aria-label={stepLabel(name, text)}
                  disabled={!canOperate || targetOf(edge, minutes, liveNow) === null}
                  onClick={() => step(edge, minutes)}
                >
                  {text}
                </button>
              );
            })}
          </span>
          <form className="track-edge-set" noValidate onSubmit={(event) => setEdge(edge, event)}>
            <input
              className="ui-input"
              type="time"
              aria-label={edgeTimeLabel(name)}
              value={edgeTime[edge]}
              aria-invalid={edgeError === edge}
              aria-describedby={edgeError === edge ? edgeErrorId : undefined}
              onChange={(event) => {
                setEdgeTime((prev) => ({ ...prev, [edge]: event.target.value }));
                setEdgeError(null);
              }}
            />
            <button type="submit" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate}>
              {EDGE_SET_BUTTON}
            </button>
          </form>
          {(() => {
            const preview = previewOf(edge);
            return preview !== null && <ReadRangeHint preview={preview} />;
          })()}
          {edgeError === edge && (
            <p id={edgeErrorId} className="track-form-error ui-note ui-note--error" role="alert">
              {EDGE_OUT_OF_RANGE}
            </p>
          )}
        </div>
      ))}

      <form className="track-editor-row" noValidate onSubmit={split} aria-label={SPLIT_HEADING}>
        <div className="track-field">
          <label htmlFor={splitTimeId}>{SPLIT_TIME_FIELD}</label>
          <input
            id={splitTimeId}
            className="ui-input"
            type="time"
            value={splitTime}
            aria-invalid={splitError}
            aria-describedby={splitError ? splitErrorId : undefined}
            onChange={(event) => {
              setSplitTime(event.target.value);
              setSplitError(false);
            }}
          />
        </div>
        <div className="track-field">
          <label htmlFor={splitNameId}>{SPLIT_NAME_FIELD}</label>
          <input
            id={splitNameId}
            className="ui-input"
            type="text"
            value={splitLabel}
            maxLength={MAX_LABEL_INPUT}
            autoComplete="off"
            onChange={(event) => setSplitLabel(event.target.value)}
          />
        </div>
        <button type="submit" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate}>
          {SPLIT_BUTTON}
        </button>
        {splitError && (
          <p id={splitErrorId} className="track-form-error ui-note ui-note--error" role="alert">
            {SPLIT_OUT_OF_RANGE}
          </p>
        )}
      </form>

      {segment.endMs !== null && (
        <div className="track-editor-danger">
          <button type="button" className="ui-button ui-button--danger ui-button--sm" disabled={!canOperate} onClick={() => {
              actions.removeSegment(segment.id);
              onRemoved();
            }}
          >
            {REMOVE_BUTTON}
          </button>
        </div>
      )}
    </div>
  );
}
