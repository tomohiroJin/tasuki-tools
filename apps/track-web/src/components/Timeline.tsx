/**
 * 時系列（#476・FR-7・FR-17・FR-18）。区切りを始まりの順に並べ、行の［直す］でその行を開く（開くのは 1 行だけ）。
 * 名前なしの作業と、全員の切断で閉じた区切り（`autoClosed`）は目立たせる（後から直す対象）。
 * 見出しの行の［抜けを足す］で、区切りを後から足す欄を開く。
 */
import { useId, useRef, useState } from 'react';
import type { TrackView } from '@tasuki/track-core';
import {
  AUTO_CLOSED_MARK,
  EDIT_BUTTON,
  EDIT_CLOSE_BUTTON,
  INSERT_BUTTON,
  RUNNING_MARK,
  TIMELINE_EMPTY,
  TIMELINE_HEADING,
  editLabel,
  unnamedPrompt,
} from '../copy';
import type { TrackActions } from '../hooks/use-track-sync';
import { isUnnamed, nameOf, rangeTextOf } from '../track-view';
import { InsertForm } from './InsertForm';
import { SegmentEditor } from './SegmentEditor';

interface Props {
  view: TrackView;
  nowMs: number;
  getNow: () => number;
  tzOffsetMin: number;
  canOperate: boolean;
  actions: TrackActions;
}

export function Timeline({ view, nowMs, getNow, tzOffsetMin, canOperate, actions }: Props) {
  const headingId = useId();
  const insertId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const insertButtonRef = useRef<HTMLButtonElement>(null);
  const unnamedCount = view.segments.filter(isUnnamed).length;

  return (
    <section className="track-timeline ui-stack" aria-labelledby={headingId}>
      <div className="ui-section-head">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {TIMELINE_HEADING}
        </h2>
        <button
          ref={insertButtonRef}
          type="button"
          className="ui-button ui-button--secondary ui-button--sm"
          aria-expanded={inserting}
          aria-controls={inserting ? insertId : undefined}
          onClick={() => setInserting((open) => !open)}
        >
          {INSERT_BUTTON}
        </button>
      </div>
      {inserting && (
        <div id={insertId}>
          <InsertForm
            epochWallMs={view.epochWallMs}
            getNow={getNow}
            tzOffsetMin={tzOffsetMin}
            canOperate={canOperate}
            onInsert={actions.insertSegment}
            // 欄が外れるので、開いたボタンへフォーカスを返す
            onClose={() => {
              setInserting(false);
              insertButtonRef.current?.focus();
            }}
          />
        </div>
      )}
      {/* 名前のない区切りは時系列の順のまま目立たせ、件数で名前を付けるよう促す（FR-20） */}
      {unnamedCount > 0 && <p className="ui-note track-unnamed-prompt">{unnamedPrompt(unnamedCount)}</p>}
      {view.segments.length === 0 ? (
        <p className="ui-note">{TIMELINE_EMPTY}</p>
      ) : (
        <ol className="track-segments">
          {view.segments.map((segment) => {
            const editing = editingId === segment.id;
            const range = rangeTextOf(view, segment, tzOffsetMin);
            const name = nameOf(segment);
            const flagged = isUnnamed(segment) || segment.autoClosed;
            return (
              <li key={segment.id} className={flagged ? 'track-segment track-segment--flagged' : 'track-segment'} data-segment={segment.id}>
                <div className="track-segment-line">
                  <span className="track-segment-range track-digits">{range}</span>
                  <span className={isUnnamed(segment) ? 'track-segment-name track-name--unnamed' : 'track-segment-name'}>{name}</span>
                  {segment.endMs === null && <span className="track-mark">{RUNNING_MARK}</span>}
                  {segment.autoClosed && <span className="track-mark track-mark--auto">{AUTO_CLOSED_MARK}</span>}
                  <button
                    type="button"
                    className="track-segment-edit ui-button ui-button--quiet ui-button--sm"
                    aria-expanded={editing}
                    aria-label={editing ? undefined : editLabel(range, name)}
                    onClick={() => setEditingId(editing ? null : segment.id)}
                  >
                    {editing ? EDIT_CLOSE_BUTTON : EDIT_BUTTON}
                  </button>
                </div>
                {editing && (
                  <SegmentEditor
                    // 区切りが変わったら（他の人の手直しを含む）欄を作り直し、古い下書きを残さない
                    key={`${segment.id}:${segment.kind}:${segment.label}`}
                    view={view}
                    segment={segment}
                    nowMs={nowMs}
                    getNow={getNow}
                    tzOffsetMin={tzOffsetMin}
                    canOperate={canOperate}
                    actions={actions}
                    // 消した行は外れるので、時系列の見出しへフォーカスを移す
                    onRemoved={() => {
                      setEditingId(null);
                      headingRef.current?.focus();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
