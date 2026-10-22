/**
 * 進行表（#429 spec §7.2・§7.4・§7.5）。済み・いま・まだ・スキップを、色に加えて印と打ち消し線で示す。
 * 「スキップ」は**まだ始まっていないステップの行にだけ**置き、飛ばした行には「戻す」を置く（spec §4.5 判断 J8）。
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { isSingleStepRounds, scrollTopToReveal, stepRows, type StepRow } from '../agenda-view';
import {
  DONE_MARK,
  NOW_MARK,
  SKIP_BUTTON,
  STEP_LIST_HEADING,
  UNSKIP_BUTTON,
  extensionSuffix,
  minutesText,
  roundHeading,
  skipRoundLabel,
  skipStepLabel,
  unskipRoundLabel,
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

function RowItem({
  row,
  grouped,
  flatRounds,
  canOperate,
  onSetSkipped,
}: {
  row: StepRow;
  grouped: boolean;
  /** 1 ステップの回: 行そのものが回なので、読み上げ名は回を名指す */
  flatRounds: boolean;
  canOperate: boolean;
  onSetSkipped: Props['onSetSkipped'];
}) {
  const labelRound = grouped ? row.round : undefined;
  return (
    <li className={`step-list-row is-${row.status}`} aria-current={row.status === 'now' ? 'step' : undefined}>
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
          aria-label={flatRounds ? skipRoundLabel(row.round) : skipStepLabel(row.number, labelRound)}
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
          aria-label={flatRounds ? unskipRoundLabel(row.round) : unskipStepLabel(row.number, labelRound)}
          disabled={!canOperate}
          onClick={() => onSetSkipped(row.id, false)}
        >
          {UNSKIP_BUTTON}
        </button>
      )}
    </li>
  );
}

export function StepList({ view, canOperate, onSetSkipped }: Props) {
  const headingId = useId();
  const boxRef = useRef<HTMLOListElement>(null);
  const rows = stepRows(view);
  // 回数 2 以上は枠（スクロール・キーボード）を持つ。見出しで区切るのは 1 回に 2 ステップ以上のときだけ
  const scrolling = view.rounds >= 2;
  const flatRounds = isSingleStepRounds(view);
  const grouped = scrolling && !flatRounds;
  const nowId = rows.find((r) => r.status === 'now')?.id;

  // 回数 2 以上の枠の中で、いまの行が見えるようにする。動かすのは枠の `scrollTop` だけ
  // （`scrollIntoView` は祖先のページまで動かす）。最初の描画と、いまの行が変わったときに合わせる
  useEffect(() => {
    const box = boxRef.current;
    if (!scrolling || box === null || nowId === undefined) return;
    const row = box.querySelector<HTMLElement>('.step-list-row.is-now');
    if (row === null) return;
    // 枠の中での行の位置は座標の差で測る（`offsetTop` は offsetParent＝body からで、枠より上の高さが混ざる）
    const rowRect = row.getBoundingClientRect();
    const top = rowRect.top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = scrollTopToReveal(box, { top, height: rowRect.height });
  }, [scrolling, nowId]);

  const items: ReactNode[] = [];
  rows.forEach((row, i) => {
    if (grouped && row.round !== rows[i - 1]?.round) {
      items.push(
        <li key={`round-${row.round}`} className="step-list-round">
          <h3 className="step-list-round-heading">{roundHeading(row.round)}</h3>
        </li>,
      );
    }
    items.push(<RowItem key={row.id} row={row} grouped={grouped} flatRounds={flatRounds} canOperate={canOperate} onSetSkipped={onSetSkipped} />);
  });

  return (
    <section className="ui-panel step-list" aria-labelledby={headingId}>
      <h2 id={headingId} className="step-list-heading">
        {STEP_LIST_HEADING}
      </h2>
      {/* スクロールする枠はキーボードで届き（矢印・PageDown）、見出しで名前が付く。回数 1 の DOM は変えない */}
      <ol
        ref={boxRef}
        className={scrolling ? 'step-list-rows step-list-rows--scroll' : 'step-list-rows'}
        {...(scrolling ? { tabIndex: 0, 'aria-labelledby': headingId } : {})}
      >
        {items}
      </ol>
    </section>
  );
}
