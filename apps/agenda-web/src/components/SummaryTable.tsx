/**
 * 終了の一覧（#429 spec §4.3）。ステップごとの予定・追加（延長）・かかった時間・予定より（差）と、合計の押し巻き。
 * 行は agenda-core の `summaryOf` が持ち、ここは書き方だけを決める（合計の差 ＝ `summaryOf(v).driftMs`）。
 */
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
} from '../copy';

const MIN = 60_000;

/** 差の向き（色に加えて「+」「−」の印が向きを持つ） */
const toneOf = (ms: number): string => (Math.round(ms / 1000) > 0 ? 'is-late' : Math.round(ms / 1000) < 0 ? 'is-early' : 'is-even');

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
          {summary.rows.map((row) => (
            <tr key={row.id} className={row.skipped ? 'is-skipped' : undefined}>
              <th scope="row" className="summary-name">
                {row.name}
              </th>
              <td>{minutesText(row.plannedMs / MIN)}</td>
              <td>{row.extensionMs > 0 ? extensionCell(row.extensionMs / MIN) : ''}</td>
              <td>{row.skipped ? SKIP_BUTTON : durationClock(row.spentMs)}</td>
              <td className={toneOf(row.diffMs)}>{signedDuration(row.diffMs)}</td>
            </tr>
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
