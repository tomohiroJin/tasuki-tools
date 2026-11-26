/**
 * ここまでのうちわけ（#476・FR-3・FR-23）。集計の規則は track-core の `totalsOf`（休憩は合計と割合から外す）。
 *
 * 割合の帯は 1 本の横棒で、**飾り**（`aria-hidden`）。同じ情報（作業名・時間・割合）は表が持つので、色だけに頼らない。
 * 帯の色は並びの順で 4 つを巡るだけで、良し悪しを表さない（FR-19）。表の行の頭の印が、帯のどの部分かを示す。
 */
import { useId, type CSSProperties } from 'react';
import type { Totals } from '@tasuki/track-core';
import { BREAK_NAME, COLUMN_NAME, COLUMN_RATIO, COLUMN_TIME, GRAND_TOTAL, TOTALS_EMPTY, TOTALS_HEADING, WORK_TOTAL, percentText } from '../copy';
import { TONE_COUNT, formatElapsed, nameOf } from '../track-view';

export function TotalsPanel({ totals }: { totals: Totals }) {
  const headingId = useId();
  return (
    <section className="track-totals ui-stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{TOTALS_HEADING}</h2>
      {totals.totalMs === 0 && totals.rows.length === 0 ? (
        <p className="ui-note">{TOTALS_EMPTY}</p>
      ) : (
        <>
          {totals.workMs > 0 && (
            <div className="track-bar" aria-hidden="true">
              {totals.rows.map((row, index) => (
                <span key={row.label} className={`track-bar-part track-tone--${index % TONE_COUNT}`} style={{ '--share': row.ms } as CSSProperties} />
              ))}
            </div>
          )}
          <table className="track-table">
            <thead>
              <tr>
                <th scope="col">{COLUMN_NAME}</th>
                <th scope="col" className="track-table-number">
                  {COLUMN_TIME}
                </th>
                <th scope="col" className="track-table-number">
                  {COLUMN_RATIO}
                </th>
              </tr>
            </thead>
            <tbody>
              {totals.rows.map((row, index) => (
                <tr key={row.label}>
                  <th scope="row" className={row.label === '' ? 'track-table-name track-name--unnamed' : 'track-table-name'}>
                    <span className={`track-swatch track-tone--${index % TONE_COUNT}`} aria-hidden="true" />
                    <span className="track-table-label">{nameOf({ kind: 'work', label: row.label })}</span>
                  </th>
                  <td className="track-table-number track-digits">{formatElapsed(row.ms)}</td>
                  <td className="track-table-number track-digits">{percentText(Math.round(row.ratio * 100))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{WORK_TOTAL}</th>
                <td className="track-table-number track-digits">{formatElapsed(totals.workMs)}</td>
                <td />
              </tr>
              <tr>
                <th scope="row">{BREAK_NAME}</th>
                <td className="track-table-number track-digits">{formatElapsed(totals.breakMs)}</td>
                <td />
              </tr>
              <tr>
                <th scope="row">{GRAND_TOTAL}</th>
                <td className="track-table-number track-digits">{formatElapsed(totals.totalMs)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </section>
  );
}
