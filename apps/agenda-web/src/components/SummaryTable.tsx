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
  // 回ごとに <tbody> を分ける（1 つの <tbody> に見出しを並べると、前の回の見出しが後ろの回のセルにもかかる）。回数 1 は 1 つ
  const rowGroups = summary.rows.reduce<{ round: number; rows: (typeof summary.rows)[number][] }[]>((groups, row) => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.round === row.round) last.rows.push(row);
    else groups.push({ round: row.round, rows: [row] });
    return groups;
  }, []);
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
        {rowGroups.map((group) => (
          <tbody key={group.round}>
            {view.rounds >= 2 && (
              <tr className="summary-round">
                <th colSpan={5} scope="rowgroup">
                  {roundHeading(group.round)}
                </th>
              </tr>
            )}
            {group.rows.map((row) => (
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
        ))}
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
