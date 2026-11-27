/**
 * 時系列の帯（#476 第 2 段・設計 §5 D4・D5）。横軸は時刻で、作業・休憩・隙間を始まりの順に 1 本に並べる。
 *
 * **飾り**（`aria-hidden`）。同じ情報は時系列の一覧と表が持つ（割合の帯 `TotalsPanel` と同じ作法）。
 * 色だけに頼らない: 休憩は斜めの縞（`.track-band-part--break`）・隙間は空き（地の色のまま）。
 * 作業の色は合計の並びの順で巡るだけで、良し悪しを表さない（FR-19）。
 * 並びの計算は track-core の `bandOf`（計測中のいまは 1 分の刻みなので、毎秒は動かない）。
 * **色の番号は、帯と同じ 1 分の刻みの合計の並びで決める**（1 分の内で合計の順位が入れ替わっても、色は動かさない）。
 * 割り切り: 色は 1 分の刻みの並びで決めるので、秒まで見た表の頭の印と最大 1 分ずれうる。
 * 割り切り: 帯の幅は長さの比なので、全体に比べて短い区切りは細く、見えないことがある（細い区切りが溢れる・幅の最小値で右端が切れるよりも、溢れないことを優先する）。
 * 右端の時刻だけは「いま」から求める（切り下げた位置を出すと、最大 1 分遅れて見える）。
 */
import type { CSSProperties } from 'react';
import { bandOf, stepDown, totalsOf, type TrackView } from '@tasuki/track-core';
import { axisLabelsOf, toneIndexOf } from '../track-view';

interface Props {
  view: TrackView;
  /** 「いま」の位置（刻みへの切り下げは `bandOf` が行う） */
  nowMs: number;
  tzOffsetMin: number;
}

export function TimeBand({ view, nowMs, tzOffsetMin }: Props) {
  const band = bandOf(view, nowMs);
  if (band === null) return null;
  const rows = totalsOf(view, stepDown(nowMs)).rows;
  const axis = axisLabelsOf(view, band, nowMs, tzOffsetMin);
  return (
    <div className="track-band-wrap" aria-hidden="true">
      <div className="track-band-line">
        {band.parts.map((part) => (
          <span
            key={`${part.kind}:${part.startMs}`}
            className={part.kind === 'work' ? `track-band-part track-tone--${toneIndexOf(rows, part.label)}` : `track-band-part track-band-part--${part.kind}`}
            style={{ '--share': part.ms } as CSSProperties}
          />
        ))}
      </div>
      <div className="track-band-axis track-digits">
        <span>{axis.start}</span>
        <span>{axis.end}</span>
      </div>
    </div>
  );
}
