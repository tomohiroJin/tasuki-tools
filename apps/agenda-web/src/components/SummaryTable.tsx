/**
 * 終了の一覧（#429 spec §4.3）。ステップごとの予定・追加（延長）・かかった時間・予定より（差）と、合計の押し巻き。
 * 行は agenda-core の `summaryOf` が持ち、ここは書き方だけを決める（合計の差 ＝ `summaryOf(v).driftMs`）。
 */
import { Fragment } from 'react';
import { summaryOf, type AgendaView } from '@tasuki/agenda-core';
import { durationClock, signedDuration } from '../agenda-view';
import {
  DRIFT_LABEL,
  PLANNED_LABEL,
  SKIP_BUTTON,
  SPENT_LABEL,
  SUMMARY_EXTENSION_LABEL,
  SUMMARY_STEP_LABEL,
  SUMMARY_TOTAL_LABEL,
  extensionCell,
  minutesText,
  roundHeading,
} from '../copy';

const MIN = 60_000;

/**
 * 差の向き（色に加えて「+」「−」の印が向きを持つ）。**丸めは `signedDuration` と同じく絶対値で行う**
 * （符号つきのまま丸めると −500ms が 0 になり、印は「−0:01」なのに色は「予定どおり」になる）。
 */
const toneOf = (ms: number): string => {
  if (Math.round(Math.abs(ms) / 1000) === 0) return 'is-even';
  return ms > 0 ? 'is-late' : 'is-early';
};

export function SummaryTable({ view }: { view: AgendaView }) {
  const summary = summaryOf(view);
  const planned = summary.rows.reduce((sum, r) => sum + r.plannedMs, 0);
  const extension = summary.rows.reduce((sum, r) => sum + r.extensionMs, 0);
  const spent = summary.rows.reduce((sum, r) => sum + r.spentMs, 0);
  return (
    <div className="summary-scroll">
      <table className="summary-table">
        <thead>
          <tr>
            <th scope="col">{SUMMARY_STEP_LABEL}</th>
            <th scope="col">{PLANNED_LABEL}</th>
            <th scope="col">{SUMMARY_EXTENSION_LABEL}</th>
            <th scope="col">{SPENT_LABEL}</th>
            <th scope="col">{DRIFT_LABEL}</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row, i) => (
            <Fragment key={row.id}>
              {view.rounds >= 2 && row.round !== summary.rows[i - 1]?.round && (
                <tr className="summary-round">
                  <th colSpan={5} scope="rowgroup">
                    {roundHeading(row.round)}
                  </th>
                </tr>
              )}
              <tr className={row.skipped ? 'is-skipped' : undefined}>
                <th scope="row" className="summary-name">
                  {row.name}
                </th>
                <td>{minutesText(row.plannedMs / MIN)}</td>
                <td>{row.extensionMs > 0 ? extensionCell(row.extensionMs / MIN) : ''}</td>
                <td>{row.skipped ? SKIP_BUTTON : durationClock(row.spentMs)}</td>
                <td className={toneOf(row.diffMs)}>{signedDuration(row.diffMs)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{SUMMARY_TOTAL_LABEL}</th>
            <td>{minutesText(planned / MIN)}</td>
            <td>{extension > 0 ? extensionCell(extension / MIN) : ''}</td>
            <td>{durationClock(spent)}</td>
            <td className={`summary-total ${toneOf(summary.driftMs)}`}>{signedDuration(summary.driftMs)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
