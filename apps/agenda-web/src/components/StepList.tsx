/**
 * 進行表（#429 spec §7.2・§7.4・§7.5）。済み・いま・まだ・スキップを、色に加えて印と打ち消し線で示す。
 * 「スキップ」は**まだ始まっていないステップの行にだけ**置き、飛ばした行には「戻す」を置く（spec §4.5 判断 J8）。
 */
import { useId } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { stepRows, type StepRow } from '../agenda-view';
import {
  DONE_MARK,
  NOW_MARK,
  SKIP_BUTTON,
  STEP_LIST_HEADING,
  UNSKIP_BUTTON,
  extensionSuffix,
  minutesText,
  skipStepLabel,
  unskipStepLabel,
} from '../copy';

interface Props {
  view: AgendaView;
  canOperate: boolean;
  onSetSkipped: (stepId: string, skipped: boolean) => void;
}

function Mark({ row }: { row: StepRow }) {
  if (row.status === 'done') return <span className="step-list-mark">{DONE_MARK}</span>;
  if (row.status === 'now') return <span className="step-list-mark step-list-mark--now">{NOW_MARK}</span>;
  if (row.status === 'skipped') return <span className="step-list-mark step-list-mark--skipped">{SKIP_BUTTON}</span>;
  return null;
}

export function StepList({ view, canOperate, onSetSkipped }: Props) {
  const headingId = useId();
  return (
    <section className="ui-panel step-list" aria-labelledby={headingId}>
      <h2 id={headingId} className="step-list-heading">
        {STEP_LIST_HEADING}
      </h2>
      <ol className="step-list-rows">
        {stepRows(view).map((row) => (
          <li key={row.id} className={`step-list-row is-${row.status}`} aria-current={row.status === 'now' ? 'step' : undefined}>
            <span className="step-list-number">{row.number}</span>
            <span className="step-list-name">{row.name}</span>
            <Mark row={row} />
            <span className="step-list-minutes">
              {minutesText(row.plannedMin)}
              {row.extensionMin > 0 && <span className="step-list-extension">{extensionSuffix(row.extensionMin)}</span>}
            </span>
            {row.status === 'todo' && (
              <button
                type="button"
                className="ui-button ui-button--quiet ui-button--sm step-list-skip"
                aria-label={skipStepLabel(row.number)}
                disabled={!canOperate}
                onClick={() => onSetSkipped(row.id, true)}
              >
                {SKIP_BUTTON}
              </button>
            )}
            {row.status === 'skipped' && (
              <button
                type="button"
                className="ui-button ui-button--quiet ui-button--sm step-list-skip"
                aria-label={unskipStepLabel(row.number)}
                disabled={!canOperate}
                onClick={() => onSetSkipped(row.id, false)}
              >
                {UNSKIP_BUTTON}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
