/**
 * 時系列の帯（#476 第 2 段・設計 §5 D4・D5）。横軸は時刻で、作業・休憩・隙間を始まりの順に 1 本に並べる。
 *
 * **飾り**（`aria-hidden`）。同じ情報は時系列の一覧と表が持つ（割合の帯 `TotalsPanel` と同じ作法）。
 * 色だけに頼らない: 休憩は斜めの縞（`.track-band-part--break`）・隙間は空き（地の色のまま）。
 * 作業の色は表の行の頭の印と同じ番号で巡るだけで、良し悪しを表さない（FR-19）。
 * 並びの計算は track-core の `bandOf`（計測中のいまは 1 分の刻みなので、毎秒は動かない）。
 */
import type { CSSProperties } from 'react';
import { bandOf, type TrackView, type Totals } from '@tasuki/track-core';
import { clockOf, toneIndexOf } from '../track-view';

interface Props {
  view: TrackView;
  /** 「いま」の位置（刻みへの切り下げは `bandOf` が行う） */
  nowMs: number;
  totals: Totals;
  tzOffsetMin: number;
}

export function TimeBand({ view, nowMs, totals, tzOffsetMin }: Props) {
  const band = bandOf(view, nowMs);
  if (band === null) return null;
  return (
    <div className="track-band-wrap" aria-hidden="true">
      <div className="track-band-line">
        {band.parts.map((part) => (
          <span
            key={`${part.kind}:${part.startMs}`}
            className={part.kind === 'work' ? `track-band-part track-tone--${toneIndexOf(totals.rows, part.label)}` : `track-band-part track-band-part--${part.kind}`}
            style={{ '--share': part.ms } as CSSProperties}
          />
        ))}
      </div>
      <div className="track-band-axis track-digits">
        <span>{clockOf(view, band.startMs, tzOffsetMin)}</span>
        <span>{clockOf(view, band.endMs, tzOffsetMin)}</span>
      </div>
    </div>
  );
}
