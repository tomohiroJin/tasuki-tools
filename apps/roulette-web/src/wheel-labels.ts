/**
 * 円盤の席の名前の描き方（#94 PR 3・spec §6.3）。React に依存しない。
 *
 * `Wheel` はここが返す値をそのまま `<text>` の属性に書く。字の向きの網羅（全角度 × 席数）は、jsdom で
 * 360 回描き直すと CI で時間切れになった（手元の 10 倍以上遅い）ので、`tests/wheel-glyphs.test.tsx` は
 * この関数の戻り値の上で全角度を回し、描いた DOM がこの戻り値と同じであることは代表の角度で確かめる。
 */
import type { Entry } from '@tasuki/roulette-core';
import { ACROSS_R, acrossMaxEm, arcPath, fitLabel, labelKindOf, labelPlacement, polar, type LabelKind, type LabelMode } from './wheel-geometry';

export const INNER_R = 21;
export const OUTER_R = 93;
const STUD_R = 101.5;
const LABEL_R = 84;

/**
 * 席に描く名前の字（spec §6.3）。縦書きは空白を詰める（縦では 1 字ぶん空いて間延びする）・欧文も立てて
 * 1 字 1em で数える。半径を横切る横書きは席の幅で切る（`…` のぶんも空ける）。
 */
function labelText(name: string, mode: LabelMode, maxEm: number, seatDeg: number): string {
  if (mode === 'vertical') return fitLabel(name.replace(/\s+/gu, ''), maxEm, true);
  if (mode === 'radial') return fitLabel(name, maxEm);
  const em = Math.min(maxEm, acrossMaxEm(seatDeg));
  const text = fitLabel(name, em);
  return text.endsWith('…') ? fitLabel(name, em - 1) : text;
}

/** 席ごとに、名前と席の数だけで決まるもの（回転の角度に依らない）。 */
export interface Seat {
  entry: Entry;
  mid: number;
  kind: LabelKind;
  /** 3 つの書き方それぞれで切った名前（どれを使うかは回転の角度で毎フレーム決める） */
  labels: Record<LabelMode, string>;
  path: string;
  stud: [number, number];
}

export function seatsOf(entries: readonly Entry[]): Seat[] {
  const n = entries.length;
  const s = n > 0 ? 360 / n : 360;
  const maxEm = n > 12 ? 4 : 5.5;
  return entries.map((entry, i) => ({
    entry,
    mid: i * s + s / 2,
    kind: labelKindOf(entry.name),
    labels: {
      radial: labelText(entry.name, 'radial', maxEm, s),
      vertical: labelText(entry.name, 'vertical', maxEm, s),
      across: labelText(entry.name, 'across', maxEm, s),
    },
    path: arcPath(INNER_R, OUTER_R, i * s, n === 1 ? 359.99 : (i + 1) * s),
    stud: polar(STUD_R, i * s),
  }));
}

/** 席の名前の `<text>` に書く値。 */
export interface LabelView {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  /** `rotate(r x y)`（回転子の座標の中での名前の回転） */
  transform: string;
  /** 縦書き（`.wheel-label--vertical`） */
  vertical: boolean;
}

/** 回転子が `rotorDeg` のときの、席の名前の描き方。向き（`labelPlacement`）だけが角度に依る。 */
export function labelViewOf(seat: Seat, rotorDeg: number): LabelView {
  const place = labelPlacement(seat.mid, rotorDeg, seat.kind);
  const [x, y] = polar(place.mode === 'across' ? ACROSS_R : LABEL_R, seat.mid);
  return {
    text: seat.labels[place.mode],
    x,
    y,
    anchor: place.anchor,
    transform: `rotate(${place.rotate} ${x} ${y})`,
    vertical: place.mode === 'vertical',
  };
}
