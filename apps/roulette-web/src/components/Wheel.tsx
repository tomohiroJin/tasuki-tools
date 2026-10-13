/**
 * 円盤（SVG・spec §6.3）。**飾りに近い**ので `aria-hidden`（読み上げは結果の一言が持つ。名前の全体は
 * 脇の一覧が持つ）。座標は viewBox の中心が原点・0° は真上で時計回り。
 *
 * 色は CSS のクラスで当てる（生の色を書かない）。グラデーションの `<stop>` の色も CSS の `stop-color` で
 * 当てる（`scripts/audit-ui-components.mjs` は TSX の `style` の中の生の色を拾わないが、CSS は拾う）。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Entry } from '@tasuki/roulette-core';
import { toneOf } from '../wheel-geometry';
import { INNER_R, OUTER_R, labelViewOf, seatsOf } from '../wheel-labels';
import { segmentBoundaryIndex } from '../wheel-motion';

interface Props {
  entries: readonly Entry[];
  /** 止まった後の当たりの席（無ければ -1） */
  winnerIndex: number;
  /** この一周で選ばれた人（沈めて、字を薄くする） */
  drawnIds: ReadonlySet<string>;
  angle: number;
  pointerDeg: number;
  /** 回っている間だけ、席の境目で指し針を弾ませる */
  spinning: boolean;
  reducedMotion: boolean;
}

export function Wheel({ entries, winnerIndex, drawnIds, angle, pointerDeg, spinning, reducedMotion }: Props) {
  const n = entries.length;
  // 名前の性質・各書き方の切り方・扇形は席の並びだけで決まるので、回転の毎フレームでは計算し直さない。
  // 向き（`labelPlacement`）だけが回転の角度に依るので毎フレーム決める
  const seats = useMemo(() => seatsOf(entries), [entries]);
  const pointer = useRef<SVGPathElement>(null);

  // 席の境目を指し針が通るたびに小さく弾ませる（減速すると間隔が開き、止まる直前に緩む）
  const boundary = spinning && !reducedMotion && n > 0 ? segmentBoundaryIndex(angle, n, pointerDeg) : -1;
  useEffect(() => {
    const el = pointer.current;
    if (boundary < 0 || el === null || typeof el.animate !== 'function') return;
    el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(0deg)' }], {
      duration: 120,
      easing: 'ease-out',
    });
  }, [boundary]);

  return (
    <svg className="wheel" viewBox="-122 -122 244 244" aria-hidden="true" focusable="false">
      <defs>
        {/* 真鍮の縁: 円錐のグラデーションは SVG に無いので、斜めの線形で金属の照り返しにする */}
        <linearGradient id="wheel-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="wheel-stop wheel-stop--brass-lift" />
          <stop offset="0.35" className="wheel-stop wheel-stop--brass" />
          <stop offset="0.6" className="wheel-stop wheel-stop--brass-deep" />
          <stop offset="1" className="wheel-stop wheel-stop--brass-bright" />
        </linearGradient>
        <radialGradient id="wheel-felt-shine" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" className="wheel-stop wheel-stop--shine-in" />
          <stop offset="1" className="wheel-stop wheel-stop--shine-out" />
        </radialGradient>
      </defs>
      <circle r="106" fill="url(#wheel-brass)" />
      <circle className="wheel-well" r="97" />
      <g className="wheel-rotor" transform={`rotate(${angle})`}>
        <g>
          {seats.map((seat, i) => {
            const { entry, path } = seat;
            const isWinner = i === winnerIndex;
            const isDrawn = !isWinner && drawnIds.has(entry.id);
            const view = labelViewOf(seat, angle);
            const modifier = `${isDrawn ? ' wheel-segment--drawn' : ''}${isWinner ? ' wheel-segment--winner' : ''}`;
            return (
              <g key={entry.id}>
                <path className={`wheel-segment wheel-segment--${toneOf(i, n)}${modifier}`} d={path} />
                <text
                  className={`wheel-label${isDrawn ? ' wheel-label--drawn' : ''}${isWinner ? ' wheel-label--winner' : ''}${view.vertical ? ' wheel-label--vertical' : ''}`}
                  x={view.x}
                  y={view.y}
                  textAnchor={view.anchor}
                  transform={view.transform}
                >
                  {view.text}
                </text>
              </g>
            );
          })}
        </g>
        <circle r={OUTER_R} fill="url(#wheel-felt-shine)" pointerEvents="none" />
        <g>
          {seats.map(({ entry, stud: [sx, sy] }) => (
            <circle key={entry.id} className="wheel-stud" cx={sx} cy={sy} r="2.1" />
          ))}
        </g>
      </g>
      <circle className="wheel-hub" r={INNER_R} />
      <text className="wheel-hub-count" y="1">
        {n}
      </text>
      {/* 指し針: 真鍮の小旗。円盤の外（下 or 右）から席を指す */}
      <g transform={`rotate(${pointerDeg - 180})`}>
        <path ref={pointer} className="wheel-pointer" d="M0 92 L-9 116 Q0 121 9 116 Z" />
      </g>
    </svg>
  );
}
