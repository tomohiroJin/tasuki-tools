// 札の寸法とマークの並び（#403・設計 §5.3）。描画から切り離した純粋なデータで、並びの正しさを試験できる。
// 座標は整数に丸める（上下の写しが浮動小数の誤差でずれないように）。
import type { Rank } from '@tasuki/poker-core';

/** 札の座標系（ポーカーサイズ 63 × 88 mm と同じ比率） */
export const CARD_WIDTH = 252;
export const CARD_HEIGHT = 352;

/** 数札のマークの大きさ・A の大きさ */
export const PIP_SIZE = 48;
export const ACE_SIZE = 112;

export interface Pip {
  x: number;
  y: number;
  /** 下半分のマークは逆さに置く（実物のトランプと同じ） */
  flipped: boolean;
}

const CX = CARD_WIDTH / 2;
const CY = CARD_HEIGHT / 2;
const LEFT = 78;
const RIGHT = CARD_WIDTH - LEFT;
const TOP = 82;
const BOTTOM = CARD_HEIGHT - TOP;
/** 9・10 の 4 段の内側の 2 段 */
const UPPER = Math.round(TOP + (BOTTOM - TOP) / 3);
const LOWER = CARD_HEIGHT - UPPER;
/** 7・8 の真ん中の列のマーク（7 は上の 1 つだけ。実物のトランプも 7 は上下対称でない） */
const MID_UPPER = Math.round((TOP + CY) / 2);
const MID_LOWER = CARD_HEIGHT - MID_UPPER;
/** 10 の真ん中の列のマーク */
const TEN_UPPER = Math.round((TOP + UPPER) / 2);
const TEN_LOWER = CARD_HEIGHT - TEN_UPPER;

const corners: Array<[number, number]> = [
  [LEFT, TOP],
  [RIGHT, TOP],
  [LEFT, BOTTOM],
  [RIGHT, BOTTOM],
];
const nineSides: Array<[number, number]> = [...corners, [LEFT, UPPER], [RIGHT, UPPER], [LEFT, LOWER], [RIGHT, LOWER]];

const LAYOUTS: Partial<Record<Rank, Array<[number, number]>>> = {
  2: [
    [CX, TOP],
    [CX, BOTTOM],
  ],
  3: [
    [CX, TOP],
    [CX, CY],
    [CX, BOTTOM],
  ],
  4: corners,
  5: [...corners, [CX, CY]],
  6: [...corners, [LEFT, CY], [RIGHT, CY]],
  7: [...corners, [LEFT, CY], [RIGHT, CY], [CX, MID_UPPER]],
  8: [...corners, [LEFT, CY], [RIGHT, CY], [CX, MID_UPPER], [CX, MID_LOWER]],
  9: [...nineSides, [CX, CY]],
  10: [...nineSides, [CX, TEN_UPPER], [CX, TEN_LOWER]],
  14: [[CX, CY]],
};

/** 数札と A のマークの並び。絵札（J・Q・K）は絵を描くので空 */
export function pipLayout(rank: Rank): Pip[] {
  return (LAYOUTS[rank] ?? []).map(([x, y]) => ({ x, y, flipped: y > CY }));
}
